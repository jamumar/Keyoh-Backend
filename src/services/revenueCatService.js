require('dotenv').config();

const REVENUECAT_API_BASE = 'https://api.revenuecat.com/v1';

const STORE_MAP = {
    app_store: 'app_store',
    mac_app_store: 'app_store',
    play_store: 'play_store',
    stripe: 'stripe',
    promotional: 'promotional',
};

const normalizeStore = (store) => STORE_MAP[store] || 'unknown';

const inferBillingPeriod = (productId) => {
    const id = (productId || '').toLowerCase();
    if (id.includes('month')) return 'monthly';
    if (id.includes('annual') || id.includes('year') || id.includes('anual')) return 'annual';
    return 'annual';
};

const isEntitlementActive = (entitlement) => {
    if (!entitlement) return false;
    if (!entitlement.expires_date) return true;
    return new Date(entitlement.expires_date).getTime() > Date.now();
};

const hasActiveEntitlement = (subscriberPayload) => {
    const entitlements = subscriberPayload?.subscriber?.entitlements ?? {};
    return Object.values(entitlements).some(isEntitlementActive);
};

const isSubscriptionActive = (subscription) => {
    if (!subscription) return false;
    if (!subscription.expires_date) return true;
    return new Date(subscription.expires_date).getTime() > Date.now();
};

const resolveBillingStatus = ({ periodType, entitlement, subscription }) => {
    if (subscription?.billing_issues_detected_at) return 'grace_period';
    if (subscription?.unsubscribe_detected_at && !subscription?.expires_date) return 'cancelled';
    if (periodType === 'trial' || periodType === 'intro') return 'trialing';
    if (entitlement && !isEntitlementActive(entitlement)) return 'expired';
    if (subscription?.unsubscribe_detected_at) return 'cancelled';
    return 'active';
};

const parseBillingFromSubscriber = (subscriberPayload) => {
    const subscriber = subscriberPayload?.subscriber;
    if (!subscriber) return null;

    const entitlements = subscriber.entitlements ?? {};
    const subscriptions = subscriber.subscriptions ?? {};

    const activeEntry = Object.entries(entitlements).find(([, entitlement]) => isEntitlementActive(entitlement));
    if (activeEntry) {
        const [entitlementId, entitlement] = activeEntry;
        const productId = entitlement.product_identifier;
        const subscription = subscriptions[productId] ?? Object.values(subscriptions)[0] ?? null;
        const periodType = subscription?.period_type ?? null;

        const startDate = subscription?.original_purchase_date
            || subscription?.purchase_date
            || entitlement.original_purchase_date
            || entitlement.purchase_date;

        const expireDate = entitlement.expires_date || subscription?.expires_date || null;
        const willRenew = !subscription?.unsubscribe_detected_at && !subscription?.billing_issues_detected_at;

        return {
            revenue_cat_app_user_id: subscriber.original_app_user_id || subscriberPayload.requested_app_user_id,
            product_id: productId,
            package_id: null,
            offering_id: null,
            entitlement_id: entitlementId,
            billing_period: inferBillingPeriod(productId),
            status: resolveBillingStatus({ periodType, entitlement, subscription }),
            start_date: startDate ? new Date(startDate) : new Date(),
            expire_date: expireDate ? new Date(expireDate) : null,
            will_renew: willRenew,
            store: normalizeStore(entitlement.store || subscription?.store),
            is_trial: periodType === 'trial' || periodType === 'intro',
        };
    }

    const activeSubEntry = Object.entries(subscriptions).find(([, subscription]) => isSubscriptionActive(subscription));
    if (!activeSubEntry) return null;

    const [productId, subscription] = activeSubEntry;
    const periodType = subscription?.period_type ?? null;
    const startDate = subscription.original_purchase_date || subscription.purchase_date;
    const expireDate = subscription.expires_date || null;
    const willRenew = !subscription.unsubscribe_detected_at && !subscription.billing_issues_detected_at;

    return {
        revenue_cat_app_user_id: subscriber.original_app_user_id || subscriberPayload.requested_app_user_id,
        product_id: productId,
        package_id: null,
        offering_id: null,
        entitlement_id: null,
        billing_period: inferBillingPeriod(productId),
        status: resolveBillingStatus({ periodType, entitlement: null, subscription }),
        start_date: startDate ? new Date(startDate) : new Date(),
        expire_date: expireDate ? new Date(expireDate) : null,
        will_renew: willRenew,
        store: normalizeStore(subscription.store),
        is_trial: periodType === 'trial' || periodType === 'intro',
    };
};

const getSubscriber = async (appUserId) => {
    const secretKey = process.env.REVENUECAT_SECRET_API_KEY;
    if (!secretKey) {
        throw new Error('REVENUECAT_SECRET_API_KEY is not configured');
    }

    const response = await fetch(
        `${REVENUECAT_API_BASE}/subscribers/${encodeURIComponent(appUserId)}`,
        {
            headers: {
                Authorization: `Bearer ${secretKey}`,
                'Content-Type': 'application/json',
            },
        },
    );

    if (response.status === 404) {
        return null;
    }

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`RevenueCat verification failed (${response.status}): ${body}`);
    }

    const payload = await response.json();
    return {
        ...payload,
        requested_app_user_id: appUserId,
    };
};

const verifyActiveSubscription = async (appUserId) => {
    const subscriber = await getSubscriber(appUserId);
    if (!subscriber) {
        return { isActive: false, billing: null };
    }

    const billing = parseBillingFromSubscriber(subscriber);
    return {
        isActive: Boolean(billing),
        billing,
    };
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const verifyActiveSubscriptionWithRetry = async (appUserId, { attempts = 3, delayMs = 1500 } = {}) => {
    let lastResult = { isActive: false, billing: null };

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        lastResult = await verifyActiveSubscription(appUserId);
        if (lastResult.isActive && lastResult.billing) {
            return lastResult;
        }
        if (attempt < attempts) {
            await sleep(delayMs);
        }
    }

    return lastResult;
};

const mapClientBillingToSnapshot = (clientBilling, revenueCatAppUserId) => {
    if (!clientBilling?.productId || !revenueCatAppUserId) return null;

    const status = clientBilling.status === 'trialing' ? 'trialing' : 'active';
    const startDate = clientBilling.startDate ? new Date(clientBilling.startDate) : new Date();

    return {
        revenue_cat_app_user_id: revenueCatAppUserId,
        product_id: clientBilling.productId,
        package_id: clientBilling.packageId || null,
        offering_id: clientBilling.offeringId || null,
        entitlement_id: clientBilling.entitlementId || null,
        billing_period: clientBilling.billingPeriod || inferBillingPeriod(clientBilling.productId),
        status,
        start_date: startDate,
        expire_date: clientBilling.expireDate ? new Date(clientBilling.expireDate) : null,
        will_renew: clientBilling.willRenew ?? true,
        store: normalizeStore(clientBilling.store),
        is_trial: Boolean(clientBilling.isTrial),
    };
};

const isRecentPurchaseBilling = (clientBilling, maxAgeMs = 10 * 60 * 1000) => {
    if (!clientBilling?.startDate) return false;
    const startMs = new Date(clientBilling.startDate).getTime();
    if (Number.isNaN(startMs)) return false;
    return Date.now() - startMs <= maxAgeMs;
};

const canTrustClientBilling = (clientBilling, revenueCatAppUserId) => {
    if (!clientBilling || !revenueCatAppUserId) return false;
    if (!['active', 'trialing'].includes(clientBilling.status)) return false;
    if (!clientBilling.productId) return false;
    if (clientBilling.revenueCatAppUserId
        && clientBilling.revenueCatAppUserId !== revenueCatAppUserId) {
        return false;
    }
    return isRecentPurchaseBilling(clientBilling);
};

const buildFreeAgentBillingSnapshot = () => {
    const startDate = new Date();
    const expireDate = new Date(startDate);
    expireDate.setFullYear(expireDate.getFullYear() + 1);

    return {
        revenue_cat_app_user_id: `free-agent-${Date.now()}`,
        product_id: 'agent.free.trial',
        package_id: 'free_annual',
        offering_id: 'agent_anual_trial',
        entitlement_id: 'agent',
        billing_period: 'annual',
        status: 'trialing',
        start_date: startDate,
        expire_date: expireDate,
        will_renew: false,
        store: 'promotional',
        is_trial: true,
    };
};

module.exports = {
    getSubscriber,
    hasActiveEntitlement,
    parseBillingFromSubscriber,
    verifyActiveSubscription,
    verifyActiveSubscriptionWithRetry,
    mapClientBillingToSnapshot,
    canTrustClientBilling,
    buildFreeAgentBillingSnapshot,
    inferBillingPeriod,
    normalizeStore,
};
