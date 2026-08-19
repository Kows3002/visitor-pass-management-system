const passService = require('../services/passService');
const { ok } = require('../utils/response');
exports.verify = async (req, res, next) => { try { ok(res, await passService.publicDetails(req.params.code), 'Visitor pass verified'); } catch (error) { next(error); } };
