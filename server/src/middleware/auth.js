const jwt = require('jsonwebtoken');
const appError = require('./appError'); 
const User = require('../models/User');

const isAuth = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies.jwt) {
    token = req.cookies.jwt;
  }

  if (!token) {
    return next(appError(401, '你尚未登入！', next));
  }

  try {
    const decoded = await jwt.verify(token, process.env.JWT_SECRET);

    const currentUser = await User.findById(decoded.id);
    if (!currentUser) {
      return next(appError(401, '用戶不存在！', next));
    }

    req.user = currentUser;
    next();
  } catch (err) {
    return next(appError(401, '無效的 token！', next));
  }
};

const generateSendJWT= (user,statusCode,res)=>{
    // 產生 JWT token
    const token = jwt.sign({id:user._id},process.env.JWT_SECRET,{     //payload user._id   process.env.JWT_SECRET 混淆保證安全性  
      expiresIn: process.env.JWT_EXPIRES_DAY   // 過期時間
    });
    user.password = undefined;
    // res.status(statusCode).json({
    //   status: 'success',
    //   user:{
    //     token,
    //     name: user.name
    //   }
    // });
    return token;
  }

module.exports = {
    isAuth,
    generateSendJWT
}