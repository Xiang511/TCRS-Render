const mongoose = require('mongoose');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
  googleId: {
    type: String, // 添加 googleId 欄位
    unique: true, // 確保唯一
  },
  name: {
    type: String,
    required: [true, '請輸入您的名字']
  },
  email: {
    type: String,
    required: [true, '請輸入您的 Email'],
    unique: true,
    lowercase: true,
    select: true
  },
  photo: String,
  password: {
    type: String,
    required: [true, '請輸入密碼'],
    minlength: 8,
    select: false
  },
  passwordResetToken: String,
  passwordResetExpires: Date,
  createdAt: {
    type: Date,
    default: Date.now,
    select: true
  }
});

// 生成重設密碼 token
userSchema.methods.createPasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString('hex');

  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  this.passwordResetExpires = Date.now() + 60 * 60 * 1000; // 1 小時後過期

  return resetToken;
};
// User
const User = mongoose.model('user', userSchema);

module.exports = User;
