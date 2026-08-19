const ExcelJS = require('exceljs');
const Visitor = require('../models/Visitor');
const visitorService = require('../services/visitorService');
const activity = require('../services/activityService');
const notifications = require('../services/notificationService');
const { ok } = require('../utils/response');

exports.approve = async (req, res, next) => {
  try {
    const succeeded = [];
    const failed = [];
    for (const id of [...new Set(req.body.ids)]) {
      try {
        const visitor = await visitorService.transition(id, 'approve', req.user, req.body.remarks);
        await activity.record(req, 'approved', visitor._id, req.body.remarks, { bulkOperation: true });
        await visitor.populate('employee', 'name email');
        await visitor.populate('department', 'name code');
        const notification = await notifications.sendDecisionNotification(visitor, 'approved');
        succeeded.push({ _id: visitor._id, visitorName: visitor.visitorName, status: visitor.status, notification });
      } catch (error) {
        failed.push({ _id: id, code: error.code || 'APPROVAL_FAILED', message: error.message });
      }
    }
    ok(res, {
      processed: succeeded.length + failed.length,
      succeeded: succeeded.length,
      failed: failed.length,
      items: succeeded,
      errors: failed,
    }, failed.length ? 'Bulk approval completed with some exceptions' : 'Selected visitors approved');
  } catch (error) { next(error); }
};

exports.exportExcel = async (req, res, next) => {
  try {
    const visitors = await Visitor.find({ _id: { $in: [...new Set(req.body.ids)] } })
      .populate('employee', 'name email')
      .populate('department', 'name code')
      .sort({ visitDate: -1, expectedArrival: -1 })
      .lean();
    const workbook = new ExcelJS.Workbook();
    workbook.creator = req.user.name;
    workbook.created = new Date();
    const sheet = workbook.addWorksheet('Selected Visitors', { views: [{ state: 'frozen', ySplit: 4 }] });
    sheet.mergeCells('A1:L1');
    sheet.getCell('A1').value = 'Visitor Pass Management System';
    sheet.getCell('A1').font = { bold: true, size: 18, color: { argb: 'FFFFFFFF' } };
    sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF203846' } };
    sheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 30;
    sheet.mergeCells('A2:L2');
    sheet.getCell('A2').value = `Selected visitor export · Generated ${new Date().toLocaleString('en-GB')} · By ${req.user.name}`;
    sheet.getCell('A2').alignment = { horizontal: 'center' };
    sheet.getCell('A2').font = { italic: true, color: { argb: 'FF5F7180' } };
    const headers = ['Visitor Name', 'Company', 'Phone', 'Email', 'Host Employee', 'Department', 'Purpose', 'Visit Date', 'Expected Arrival', 'Check-In', 'Check-Out', 'Status'];
    sheet.addRow([]);
    const header = sheet.addRow(headers);
    header.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF49687A' } };
      cell.alignment = { vertical: 'middle' };
    });
    visitors.forEach((visitor) => sheet.addRow([
      visitor.visitorName, visitor.companyName || '', visitor.phone, visitor.email || '', visitor.employee?.name || '',
      visitor.department?.name || '', visitor.purpose, visitor.visitDate, visitor.expectedArrival,
      visitor.checkedInAt || '', visitor.checkedOutAt || '', visitor.status.replaceAll('_', ' ').toUpperCase(),
    ]));
    sheet.columns = [22, 20, 17, 28, 22, 20, 30, 15, 18, 22, 22, 16].map((width) => ({ width }));
    sheet.getColumn(8).numFmt = 'dd mmm yyyy';
    sheet.getColumn(10).numFmt = 'dd mmm yyyy hh:mm';
    sheet.getColumn(11).numFmt = 'dd mmm yyyy hh:mm';
    for (let row = 4; row <= sheet.rowCount; row += 1) {
      sheet.getRow(row).eachCell((cell) => { cell.border = { top: { style: 'thin', color: { argb: 'FFD4DEE5' } }, left: { style: 'thin', color: { argb: 'FFD4DEE5' } }, bottom: { style: 'thin', color: { argb: 'FFD4DEE5' } }, right: { style: 'thin', color: { argb: 'FFD4DEE5' } } }; });
    }
    sheet.addRow([]);
    const total = sheet.addRow([`Total selected visitors: ${visitors.length}`]);
    total.getCell(1).font = { bold: true };
    const buffer = await workbook.xlsx.writeBuffer();
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="selected-visitors-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      'Cache-Control': 'no-store',
    });
    return res.status(200).send(Buffer.from(buffer));
  } catch (error) { return next(error); }
};
