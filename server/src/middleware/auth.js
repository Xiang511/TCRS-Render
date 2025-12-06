const jwt = require('jsonwebtoken');
const appError = require('./appError'); 
const User = require('../models/User');

const isAuth = async (req, res, next) => {
    // 確認 token 是否存在
    let token;
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies && req.cookies.jwt) {
      token = req.cookies.jwt;
    }
  
    if (!token) {
      return res.redirect('/users/sign_in');
    }
  
    try {
      // 驗證 token 正確性
      const decoded = await new Promise((resolve,reject)=>{
        jwt.verify(token,process.env.JWT_SECRET,(err,payload)=>{
          if(err){
            reject(err)
          }else{
            resolve(payload) // payload 是解碼後的資料 取出 id
          }
        })
      })
      const currentUser = await User.findById(decoded.id); ///moogoose 的方法
      
      if (!currentUser) {
        return res.redirect('/users/sign_in');
      }
    
      req.user = currentUser; // 把 user 放到 req 裡面
      next();
    } catch (err) {
      console.error('認證錯誤:', err);
      return res.redirect('/users/sign_in');
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

// 可選的認證中間件 - 如果有 token 就驗證，沒有就繼續
const optionalAuth = async (req, res, next) => {
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies && req.cookies.jwt) {
    token = req.cookies.jwt;
  }

  // 如果沒有 token，設置 user 為 null 並繼續
  if (!token) {
    req.user = null;
    return next();
  }

  try {
    // 驗證 token 正確性
    const decoded = await new Promise((resolve,reject)=>{
      jwt.verify(token,process.env.JWT_SECRET,(err,payload)=>{
        if(err){
          reject(err)
        }else{
          resolve(payload)
        }
      })
    })
    const currentUser = await User.findById(decoded.id);
    
    // 如果找到用戶，設置到 req.user
    req.user = currentUser || null;
    next();
  } catch (err) {
    // Token 無效，設置 user 為 null 並繼續
    console.log('Token 驗證失敗，繼續為訪客模式');
    req.user = null;
    next();
  }
};

module.exports = {
    isAuth,
    generateSendJWT,
    optionalAuth
}