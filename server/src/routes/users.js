const express = require('express');
const bcrypt = require('bcryptjs');
const validator = require('validator');
const User = require('../models/User');
const { isAuth, generateSendJWT } = require('../middleware/auth');
const router = express.Router();


router.get('/logout', isAuth, (req, res) => {
    res.cookie('jwt', '', { maxAge: 1 }); // 清除 cookie
    res.redirect('/'); // 重定向到登入頁面
});

router.get('/sign_in', (req, res) => {
    res.render('userpage/sign_in');
});

router.post('/sign_in', async (req, res, next) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.json({ status: 'error', message: '帳號密碼不可為空' });
    }
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
        return res.json({ status: 'error', message: '帳號或密碼錯誤' });
    }
    const auth = await bcrypt.compare(password, user.password);
    if (!auth) {
        return res.json({ status: 'error', message: '帳號或密碼錯誤' });
    }
    const token = generateSendJWT(user); // 生成 JWT
    res.cookie('jwt', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production' }); // 設置 cookie
    return res.json({
        status: 'success',
        message: '登入成功',
        token: token, // 同時返回 token 給前端
        redirect: '/users/profile'
    });
});

router.get('/sign_up', (req, res) => {
    res.render('userpage/sign_up',);
});

router.post('/sign_up', async (req, res, next) => {
    let { email, password, confirmPassword, name } = req.body;
    // 內容不可為空
    if (!email || !password || !confirmPassword || !name) {
        return res.json({ status: 'error', message: '您填寫的欄位不正確' });
    }
    // 密碼正確
    if (password !== confirmPassword) {
        return res.json({ status: 'error', message: '您的密碼並不一致' });
    }
    // 密碼 8 碼以上
    if (!validator.isLength(password, { min: 8 })) {
        return res.json({ status: 'error', message: '您的密碼不足 8 碼' });
    }
    // 是否為 Email
    if (!validator.isEmail(email)) {
        return res.json({ status: 'error', message: '您的Email格式不正確' });
    }

    // 加密密碼
    password = await bcrypt.hash(req.body.password, 12);
    const newUser = await User.create({
        email,
        password,
        name
    });
    const token = generateSendJWT(newUser); // 生成 JWT
    res.cookie('jwt', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });
    return res.json({ status: 'success', message: '註冊成功', redirect: '/users/profile' });
});

router.get('/profile/', isAuth, async (req, res, next) => {
    res.render('userpage/profile', { user: req.user  });
});

router.post('/updateProfile/', isAuth, async (req, res, next) => {
    const { name, email } = req.body;
    // 內容不可為空
    if (!name) {
        return res.status(400).json({ status: 'error', message: '您填寫的欄位不正確' });
    }
    // 更新使用者資料
    const updatedUser = await User.findByIdAndUpdate(req.user.id, {
        name,
    }, { new: true });
    return res.status(200).json({ status: 'success', message: '個人資料更新成功', user: updatedUser }); 
});


router.post('/updatePassword', isAuth, async (req, res, next) => {
    const { password, confirmNewPassword, currentPassword } = req.body;
    
    // 檢查所有必要欄位
    if (!currentPassword || !password || !confirmNewPassword) {
        return res.status(400).json({ status: 'error', message: '請填寫所有欄位！' });
    }
    
    // 檢查新密碼是否一致
    if (password !== confirmNewPassword) {
        return res.status(400).json({ status: 'error', message: '新密碼不一致！' });
    }
    
    // 檢查密碼長度
    if (password.length < 8) {
        return res.status(400).json({ status: 'error', message: '密碼長度至少需要 8 個字元！' });
    }
    
    // 取得 current password
    const user = await User.findById(req.user.id).select('+password');
    if (!user) {
        return res.status(404).json({ status: 'error', message: '用戶不存在！' });
    }
    
    // 驗證舊密碼
    const auth = await bcrypt.compare(currentPassword, user.password);
    if (!auth) {
        return res.status(400).json({ status: 'error', message: '目前密碼錯誤！' });
    }
    
    // 加密新密碼
    const newPassword = await bcrypt.hash(password, 12);
    const updatedUser = await User.findByIdAndUpdate(req.user.id, {
        password: newPassword
    }, { new: true });
    
    const token = generateSendJWT(updatedUser);
    res.cookie('jwt', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });
    return res.status(200).json({ status: 'success', message: '您已成功變更密碼' });
});

module.exports = router;