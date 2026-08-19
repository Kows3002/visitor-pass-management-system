const successBody=(data,message,meta)=>({success:true,message,data,...(meta&&{meta})});
exports.ok=(res,data,message='Success',meta)=>res.status(200).json(successBody(data,message,meta));
exports.created=(res,data,message='Created successfully',meta)=>res.status(201).json(successBody(data,message,meta));
exports.fail=(res,status,message,code='ERROR',errors,extra={})=>res.status(status).json({success:false,message,code,...(errors?.length&&{errors}),...extra});
