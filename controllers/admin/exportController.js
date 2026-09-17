const ExcelJS = require('exceljs');
const Order = require('../../models/order');

const money = (n) => (typeof n === 'number' ? n : 0);

exports.exportOrders = async (req, res) => {
  try {
    const orders = await Order.find()
      .sort({ createdAt: -1 })
      .limit(10000)
      .populate('user', 'username email contactNumber')
      .lean();

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Orders');

    sheet.columns = [
      { header: 'Order #', key: 'orderNumber', width: 22 },
      { header: 'Date', key: 'createdAt', width: 20 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Payment', key: 'paymentStatus', width: 12 },
      { header: 'Customer', key: 'customer', width: 28 },
      { header: 'Email', key: 'email', width: 28 },
      { header: 'Phone', key: 'phone', width: 16 },
      { header: 'Ship city', key: 'city', width: 16 },
      { header: 'Items', key: 'items', width: 8 },
      { header: 'Total (INR)', key: 'total', width: 14 }
    ];

    orders.forEach((o) => {
      const u = o.user;
      sheet.addRow({
        orderNumber: o.orderNumber,
        createdAt: o.createdAt ? new Date(o.createdAt).toISOString() : '',
        status: o.status,
        paymentStatus: o.paymentStatus,
        customer: o.shippingAddress?.fullName || u?.username || '',
        email: o.shippingAddress?.email || u?.email || '',
        phone: o.shippingAddress?.phone || u?.contactNumber || '',
        city: o.shippingAddress?.city || '',
        items: Array.isArray(o.items) ? o.items.length : 0,
        total: money(o.totalAmount)
      });
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=orders-export-${Date.now()}.xlsx`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('exportOrders:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Export failed' });
    }
  }
};

exports.exportReturns = async (req, res) => {
  try {
    const orders = await Order.find({
      $or: [{ status: 'returned' }, { 'returnRequest.requested': true }]
    })
      .sort({ createdAt: -1 })
      .limit(5000)
      .populate('user', 'username email contactNumber')
      .lean();

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Returns');

    sheet.columns = [
      { header: 'Order #', key: 'orderNumber', width: 22 },
      { header: 'Date', key: 'createdAt', width: 20 },
      { header: 'Order status', key: 'status', width: 14 },
      { header: 'Return status', key: 'returnStatus', width: 14 },
      { header: 'Reason', key: 'reason', width: 36 },
      { header: 'Customer', key: 'customer', width: 24 },
      { header: 'Email', key: 'email', width: 28 },
      { header: 'Phone', key: 'phone', width: 16 },
      { header: 'Refund (if set)', key: 'refund', width: 16 }
    ];

    orders.forEach((o) => {
      const u = o.user;
      const rr = o.returnRequest || {};
      sheet.addRow({
        orderNumber: o.orderNumber,
        createdAt: o.createdAt ? new Date(o.createdAt).toISOString() : '',
        status: o.status,
        returnStatus: rr.status || '',
        reason: rr.reason || '',
        customer: o.shippingAddress?.fullName || u?.username || '',
        email: o.shippingAddress?.email || u?.email || '',
        phone: o.shippingAddress?.phone || u?.contactNumber || '',
        refund: rr.refundAmount != null ? rr.refundAmount : ''
      });
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=returns-export-${Date.now()}.xlsx`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('exportReturns:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Export failed' });
    }
  }
};
