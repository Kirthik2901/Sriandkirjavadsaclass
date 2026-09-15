/**
 * Shiprocket integration service for authenticating, creating shipments, tracking,
 * and cancelling external courier records while keeping the local order model in sync.
 */
const axios = require('axios');
const Order = require('../models/order');

const SHIPROCKET_BASE_URL = 'https://apiv2.shiprocket.in';
let shiprocketTokenCache = { token: null, expiresAt: 0 };

const normalizeShiprocketState = (state) => {
  if (!state) return 'Tamil Nadu';
  const normalized = String(state).trim();
  const lower = normalized.toLowerCase();

  const replacements = {
    'tamilnadu': 'Tamil Nadu',
    'tamil nadu': 'Tamil Nadu',
    'tn': 'Tamil Nadu',
    'tamilnad': 'Tamil Nadu',
    'madras': 'Tamil Nadu'
  };

  return replacements[lower] || normalized;
};

/**
 * Maps a provider error to a safe application error object.
 *
 * @param {Error & { response?: { status?: number, data?: { message?: string, error?: string } } }} error - Raw upstream error.
 * @param {string} fallbackMessage - Message to maintain if no provider message is available.
 * @returns {Error & { statusCode: number }} The normalized application error.
 */
const normalizeError = (error, fallbackMessage) => {
  const message = error?.response?.data?.message || error?.response?.data?.error || error?.message || fallbackMessage;
  const appError = new Error(message);
  appError.statusCode = error?.response?.status || 400;
  return appError;
};

/**
 * Fetches and caches a Shiprocket access token using the backend credentials.
 *
 * @returns {Promise<string>} A valid Shiprocket bearer token.
 * @throws {Error & { statusCode: number }} Throws when credentials are missing or login fails.
 */
const getShiprocketToken = async () => {
  const email = process.env.SHIPROCKET_EMAIL;
  const password = process.env.SHIPROCKET_PASSWORD;

  if (!email || !password) {
    const error = new Error('Shiprocket credentials are not configured');
    error.statusCode = 500;
    throw error;
  }

  if (shiprocketTokenCache.token && Date.now() < shiprocketTokenCache.expiresAt) {
    return shiprocketTokenCache.token;
  }

  try {
    const response = await axios.post(
      `${SHIPROCKET_BASE_URL}/v1/external/auth/login`,
      { email, password },
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    const token = response?.data?.token || response?.data?.data?.token;

    if (!token) {
      throw new Error('Shiprocket authentication failed');
    }

    shiprocketTokenCache = {
      token,
      expiresAt: Date.now() + (23 * 60 * 60 * 1000)
    };

    return token;
  } catch (error) {
    throw normalizeError(error, 'Shiprocket authentication failed');
  }
};

/**
 * Creates a Shiprocket shipment for a local order and updates the order once the AWB is available.
 *
 * @param {string} orderId - MongoDB order id to ship.
 * @returns {Promise<{ success: boolean, data: { shipmentId: string, awbCode: string|null, orderId: string, courierCompany: string, trackingUrl: string|null, trackingNumber: string|null }, message: string }>} Shipment creation payload.
 * @throws {Error & { statusCode: number }} Throws when the order is missing or Shiprocket rejects the shipment.
 */
const createShipment = async (orderId) => {
  const order = await Order.findById(orderId);

  if (!order) {
    const error = new Error('Order not found');
    error.statusCode = 404;
    throw error;
  }

  const address = order.shippingAddress || {};
  const billingCustomerName = String(address.fullName || 'Customer').trim();
  const billingPhone = String(address.phone || '').replace(/[^\d+]/g, '').trim();
  const billingPincode = String(address.pincode || '').replace(/\D/g, '').slice(0, 6);
  const billingCity = String(address.city || '').trim();
  const billingState = normalizeShiprocketState(address.state);
  const billingCountry = String(address.country || 'India').trim() || 'India';
  const pickupLocation = process.env.SHIPROCKET_PICKUP_LOCATION || 'Kumaran Silk House';

  if (!billingCustomerName || !billingPhone || !billingPincode || !billingCity || !billingState) {
    const error = new Error('Order is missing valid shipping details required by Shiprocket');
    error.statusCode = 400;
    throw error;
  }

  if (!/^[0-9]{10,12}$/.test(billingPhone.replace(/^\+91/, ''))) {
    const error = new Error('Shipping phone number is invalid for Shiprocket');
    error.statusCode = 400;
    throw error;
  }

  const token = await getShiprocketToken();

  const payload = {
    shipment_id: String(order.orderNumber || orderId),
    order_id: String(order.orderNumber || orderId),
    order_date: new Date(order.createdAt || Date.now()).toISOString().slice(0, 10),
    pickup_location: pickupLocation,
    channel_id: '',
    comment: 'Created via admin backend',
    billing_customer_name: billingCustomerName,
    billing_last_name: '',
    billing_address: String(address.addressLine1 || '').trim(),
    billing_address_2: String(address.addressLine2 || '').trim(),
    billing_city: billingCity,
    billing_state: billingState,
    billing_country: billingCountry,
    billing_pincode: billingPincode,
    billing_phone: billingPhone,
    shipping_customer_name: billingCustomerName,
    shipping_last_name: '',
    shipping_address: String(address.addressLine1 || '').trim(),
    shipping_address_2: String(address.addressLine2 || '').trim(),
    shipping_city: billingCity,
    shipping_state: billingState,
    shipping_country: billingCountry,
    shipping_pincode: billingPincode,
    shipping_phone: billingPhone,
    shipping_is_billing: true,
    payment_method: order.paymentMethod === 'cod' ? 'COD' : 'Prepaid',
    shipping_charges: Number(order.shippingCost || 0),
    total_discount: Number(order.discount || 0),
    sub_total: Number(order.subtotal || 0),
    length: 10,
    breadth: 7,
    height: 4,
    weight: 0.5,
    order_items: (order.items || []).map((item) => ({
      name: String(item.name || 'Product').trim(),
      sku: String(item.product || item._id || 'SKU').trim(),
      units: Number(item.quantity || 1),
      selling_price: Number(item.sellingPrice || item.totalPrice || 0),
      discount: 0,
      tax: 0,
      hsn: '6109'
    }))
  };

  if (!payload.billing_address || !payload.shipping_address) {
    const error = new Error('Shipping address line 1 is required for Shiprocket');
    error.statusCode = 400;
    throw error;
  }

  if (payload.order_items.length === 0) {
    const error = new Error('Order must contain at least one item for Shiprocket shipment');
    error.statusCode = 400;
    throw error;
  }

  try {
    console.log('[Shiprocket] Payload:', JSON.stringify(payload, null, 2));
    const response = await axios.post(
      `${SHIPROCKET_BASE_URL}/v1/external/orders/create/adhoc`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 20000
      }
    );

    const result = response?.data?.data || response?.data?.response || response?.data || {};
    const trackingNumber = result.awb_code || result.awbCode || result.shipment_id || result.shipmentId || null;

    if (trackingNumber) {
      order.trackingNumber = trackingNumber;
      order.shippingProvider = 'shiprocket';
      order.status = 'shipped';
      order.shippedAt = new Date();
      await order.save();
    }

    return {
      success: true,
      data: {
        shipmentId: result.shipment_id || result.shipmentId || result.order_id || order.orderNumber,
        awbCode: trackingNumber,
        orderId: result.order_id || order.orderNumber,
        courierCompany: result.courier_company || result.courierCompany || 'shiprocket',
        trackingUrl: result.tracking_url || result.trackingUrl || null,
        trackingNumber
      },
      message: 'Shipment created successfully'
    };
  } catch (error) {
    console.error('[Shiprocket] Raw provider error:', JSON.stringify(error?.response?.data || error?.message || error, null, 2));
    throw normalizeError(error, 'Unable to create shipment with Shiprocket');
  }
};

/**
 * Fetches the current tracking status for a shipment using its AWB code.
 *
 * @param {string} trackingNumber - AWB number or tracking reference from Shiprocket.
 * @returns {Promise<{ success: boolean, data: { trackingNumber: string, status: string, raw: object } }>} The latest tracking payload.
 * @throws {Error & { statusCode: number }} Throws when the tracking number is invalid or the provider request fails.
 */
const trackShipment = async (trackingNumber) => {
  if (!trackingNumber) {
    const error = new Error('Tracking number is required');
    error.statusCode = 400;
    throw error;
  }

  const token = await getShiprocketToken();

  try {
    const response = await axios.get(
      `${SHIPROCKET_BASE_URL}/v1/external/courier/track/awb/${encodeURIComponent(trackingNumber)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        },
        timeout: 20000
      }
    );

    const payload = response?.data?.data || response?.data?.response || response?.data || {};
    const currentStatus = payload.current_status || payload.status || payload.message || 'Tracking data unavailable';

    return {
      success: true,
      data: {
        trackingNumber,
        status: currentStatus,
        raw: payload
      }
    };
  } catch (error) {
    throw normalizeError(error, 'Unable to track shipment');
  }
};

/**
 * Schedules a reverse (return) pickup with Shiprocket for a delivered order, moving the
 * item from the customer's address back to the configured warehouse/pickup location.
 *
 * @param {string} orderId - MongoDB order id whose item is being returned.
 * @returns {Promise<{ success: boolean, data: { reference: string|null, provider: string }, message: string }>} Reverse pickup result.
 * @throws {Error & { statusCode: number }} Throws when the order is missing or its address is invalid.
 */
const createReturnPickup = async (orderId) => {
  const order = await Order.findById(orderId);

  if (!order) {
    const error = new Error('Order not found');
    error.statusCode = 404;
    throw error;
  }

  const address = order.shippingAddress || {};
  const customerName = String(address.fullName || 'Customer').trim();
  const customerPhone = String(address.phone || '').replace(/[^\d+]/g, '').trim();
  const customerPincode = String(address.pincode || '').replace(/\D/g, '').slice(0, 6);
  const customerCity = String(address.city || '').trim();
  const customerState = normalizeShiprocketState(address.state);
  const customerCountry = String(address.country || 'India').trim() || 'India';

  if (!customerName || !customerPhone || !customerPincode || !customerCity || !customerState) {
    const error = new Error('Order is missing valid pickup details required for reverse pickup');
    error.statusCode = 400;
    throw error;
  }

  const token = await getShiprocketToken();

  const payload = {
    order_id: `RET-${order.orderNumber || orderId}`,
    order_date: new Date().toISOString().slice(0, 10),
    channel_id: '',
    // Pickup FROM the customer.
    pickup_customer_name: customerName,
    pickup_last_name: '',
    pickup_address: String(address.addressLine1 || '').trim(),
    pickup_address_2: String(address.addressLine2 || '').trim(),
    pickup_city: customerCity,
    pickup_state: customerState,
    pickup_country: customerCountry,
    pickup_pincode: customerPincode,
    pickup_email: String(address.email || process.env.SHIPROCKET_RETURN_EMAIL || '').trim(),
    pickup_phone: customerPhone,
    // Deliver back TO the warehouse.
    shipping_customer_name: process.env.SHIPROCKET_WAREHOUSE_NAME || 'Kumaran Silk House',
    shipping_last_name: '',
    shipping_address: process.env.SHIPROCKET_WAREHOUSE_ADDRESS || String(address.addressLine1 || '').trim(),
    shipping_address_2: process.env.SHIPROCKET_WAREHOUSE_ADDRESS_2 || '',
    shipping_city: process.env.SHIPROCKET_WAREHOUSE_CITY || customerCity,
    shipping_state: normalizeShiprocketState(process.env.SHIPROCKET_WAREHOUSE_STATE || customerState),
    shipping_country: process.env.SHIPROCKET_WAREHOUSE_COUNTRY || 'India',
    shipping_pincode: String(process.env.SHIPROCKET_WAREHOUSE_PINCODE || customerPincode).replace(/\D/g, '').slice(0, 6),
    shipping_phone: String(process.env.SHIPROCKET_WAREHOUSE_PHONE || customerPhone).replace(/[^\d+]/g, '').trim(),
    payment_method: 'Prepaid',
    sub_total: Number(order.subtotal || 0),
    length: 10,
    breadth: 7,
    height: 4,
    weight: 0.5,
    order_items: (order.items || []).map((item) => ({
      name: String(item.name || 'Product').trim(),
      sku: String(item.product || item._id || 'SKU').trim(),
      units: Number(item.quantity || 1),
      selling_price: Number(item.sellingPrice || item.totalPrice || 0),
      discount: 0,
      tax: 0,
      hsn: '6109'
    }))
  };

  try {
    const response = await axios.post(
      `${SHIPROCKET_BASE_URL}/v1/external/orders/create/return`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 20000
      }
    );

    const result = response?.data || {};
    const reference = result.order_id || result.shipment_id || result.awb_code || null;

    return {
      success: true,
      data: {
        reference: reference ? String(reference) : null,
        provider: 'shiprocket'
      },
      message: 'Reverse pickup scheduled successfully'
    };
  } catch (error) {
    console.error('[Shiprocket] Reverse pickup error:', JSON.stringify(error?.response?.data || error?.message || error, null, 2));
    throw normalizeError(error, 'Unable to schedule reverse pickup with Shiprocket');
  }
};

/**
 * Cancels a shipment in Shiprocket and updates the local order to a cancelled state.
 *
 * @param {string} orderId - MongoDB order id to cancel.
 * @param {string} [reason='Admin requested cancellation'] - Local reason that should be written to the order.
 * @returns {Promise<{ success: boolean, data: { orderId: string, trackingNumber: string|null, status: string, provider: string, providerMessage: string }, message: string }>} Cancellation response payload.
 * @throws {Error & { statusCode: number }} Throws when the order cannot be found.
 */
const cancelShipment = async (orderId, reason = 'Admin requested cancellation') => {
  const order = await Order.findById(orderId);

  if (!order) {
    const error = new Error('Order not found');
    error.statusCode = 404;
    throw error;
  }

  const token = await getShiprocketToken();
  let providerMessage = 'Cancellation not attempted';

  try {
    if (order.trackingNumber) {
      const response = await axios.post(
        `${SHIPROCKET_BASE_URL}/v1/external/courier/manifest/cancel`,
        { shipment_id: order.trackingNumber },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          timeout: 20000
        }
      );
      providerMessage = response?.data?.message || response?.data?.data?.message || 'Shipment cancelled in Shiprocket';
    }
  } catch (error) {
    providerMessage = error?.response?.data?.message || error?.message || 'Shiprocket cancellation failed';
  }

  order.status = 'cancelled';
  order.cancellationReason = reason;
  order.cancelledBy = 'admin';
  order.cancelledAt = new Date();
  order.shippingProvider = order.shippingProvider || 'shiprocket';
  await order.save();

  return {
    success: true,
    data: {
      orderId: order._id,
      trackingNumber: order.trackingNumber || null,
      status: order.status,
      provider: 'shiprocket',
      providerMessage
    },
    message: 'Order cancellation processed successfully'
  };
};

module.exports = {
  getShiprocketToken,
  createShipment,
  createReturnPickup,
  trackShipment,
  cancelShipment
};
