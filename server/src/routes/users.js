const express = require('express');
const bcrypt = require('bcryptjs');
const validator = require('validator');
const crypto = require('crypto');
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
    // 檢查是否已被註冊
    const existingUser = await User.findOne({ email });
    if (existingUser) {
        return res.json({ status: 'error', message: '此Email已被註冊' });
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
    res.render('userpage/profile', { user: req.user });
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

// 顯示忘記密碼頁面
router.get('/forgotPassword', (req, res) => {
    res.render('userpage/forgotpassword');
});

// 發送重設密碼郵件 (API路由)
router.post('/auth/forgot-password', async (req, res) => {
    let user;
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ status: 'error', message: '請提供電子郵件地址' });
        }

        // 查找用戶
        user = await User.findOne({ email });
        if (!user) {
            // 為了安全起見，即使用戶不存在也返回成功訊息
            return res.status(200).json({
                status: 'success',
                message: '如果該電子郵件已註冊，您將收到重設密碼連結'
            });
        }

        // 生成重設密碼 token
        const resetToken = user.createPasswordResetToken();
        await user.save({ validateBeforeSave: false });

        // 發送郵件
        const nodemailer = require("nodemailer");

        let transporter;

        if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN) {
            transporter = nodemailer.createTransport({
                service: "gmail",
                auth: {
                    type: "OAuth2",
                    user: process.env.MY_EMAIL || "xiangtcrs@gmail.com",
                    clientId: process.env.GOOGLE_CLIENT_ID,
                    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                    refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
                },
            });
        }
        else {
            throw new Error('郵件服務未配置，請設定 EMAIL_PASS 或完整的 OAuth2 憑證');
        }

        const resetURL = `${req.protocol}://${req.get('host')}/users/resetPassword/${resetToken}`;

        await transporter.sendMail({
            from: 'TCRS <xiangtcrs@gmail.com>',
            to: user.email,
            subject: 'TCRS - 重設密碼請求',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
                        <h1 style="color: white; margin: 0;">TCRS</h1>
                    </div>
                    <div style="padding: 30px; background: #f9f9f9;">
                        <h2 style="color: #333;">重設密碼請求</h2>
                        <p>親愛的 ${user.name}，</p>
                        <p>我們收到了您的重設密碼請求。請點擊以下按鈕來重設您的密碼：</p>
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${resetURL}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">重設密碼</a>
                        </div>
                        <p>或者複製以下連結到瀏覽器：</p>
                        <p style="word-break: break-all; color: #667eea;">${resetURL}</p>
                        <p style="color: #999; font-size: 14px; margin-top: 30px;">
                            ⚠️ 此連結將在 1 小時後失效<br/>
                            如果您沒有請求重設密碼，請忽略此郵件
                        </p>
                    </div>
                    <div style="background: #333; color: white; padding: 20px; text-align: center; font-size: 12px;">
                        <p style="margin: 0;">© 2025 TCRS. All rights reserved.</p>
                    </div>
                </div>
            `
        });

        res.status(200).json({
            status: 'success',
            message: '重設密碼連結已發送到您的電子郵件'
        });
    } catch (error) {
        console.error('發送重設密碼郵件錯誤:', error);

        // 清除 token（只在 user 已定義時）
        if (user) {
            try {
                user.passwordResetToken = undefined;
                user.passwordResetExpires = undefined;
                await user.save({ validateBeforeSave: false });
            } catch (saveError) {
                console.error('清除 token 錯誤:', saveError);
            }
        }

        res.status(500).json({
            status: 'error',
            message: '發送郵件時發生錯誤，請稍後再試'
        });
    }
});

// 顯示重設密碼頁面
router.get('/resetPassword/:token', async (req, res) => {
    try {
        const hashedToken = crypto
            .createHash('sha256')
            .update(req.params.token)
            .digest('hex');

        const user = await User.findOne({
            passwordResetToken: hashedToken,
            passwordResetExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.render('userpage/error', {
                message: '重設密碼連結無效或已過期',
                redirectUrl: '/users/forgotPassword',
                redirectText: '重新申請重設密碼'
            });
        }

        res.render('userpage/resetpassword', { token: req.params.token });
    } catch (error) {
        console.error('重設密碼頁面錯誤:', error);
        res.render('userpage/error', {
            message: '發生錯誤，請稍後再試',
            redirectUrl: '/users/forgotPassword',
            redirectText: '返回'
        });
    }
});

// 處理重設密碼
router.post('/resetPassword/:token', async (req, res) => {
    try {
        const { password, confirmPassword } = req.body;

        // 驗證密碼
        if (!password || !confirmPassword) {
            return res.status(400).json({ status: 'error', message: '請填寫所有欄位' });
        }

        if (password !== confirmPassword) {
            return res.status(400).json({ status: 'error', message: '兩次輸入的密碼不一致' });
        }

        if (!validator.isLength(password, { min: 8 })) {
            return res.status(400).json({ status: 'error', message: '密碼長度至少需要 8 個字元' });
        }

        // 查找用戶
        const hashedToken = crypto
            .createHash('sha256')
            .update(req.params.token)
            .digest('hex');

        const user = await User.findOne({
            passwordResetToken: hashedToken,
            passwordResetExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({
                status: 'error',
                message: '重設密碼連結無效或已過期'
            });
        }

        // 更新密碼
        user.password = await bcrypt.hash(password, 12);
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;
        await user.save();

        // 生成新的 JWT
        const token = generateSendJWT(user);
        res.cookie('jwt', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production'
        });

        res.status(200).json({
            status: 'success',
            message: '密碼重設成功！',
            redirect: '/users/profile'
        });
    } catch (error) {
        console.error('重設密碼錯誤:', error);
        res.status(500).json({
            status: 'error',
            message: '重設密碼時發生錯誤，請稍後再試'
        });
    }
});


module.exports = router;