exports.ok = (res, data, message = 'Success', meta) => res.json({ success: true, message, data, ...(meta && { meta }) });
exports.created = (res, data, message = 'Created successfully') => res.status(201).json({ success: true, message, data });
