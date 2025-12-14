var dotenv = require('dotenv');
const express = require('express');
const bcrypt = require('bcryptjs');
const validator = require('validator');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const { isAuth, generateSendJWT } = require('../middleware/auth');
const router = express.Router();
dotenv.config({ path: './config.env' });

// ========== 忘記密碼速率限制設定 ==========
const forgotPasswordLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 分鐘
    max: 3, // 最多 3 次請求
    message: {
        status: 'error',
        message: '請求過於頻繁，請 15 分鐘後再試'
    },
    standardHeaders: true, // 返回 RateLimit-* headers
    legacyHeaders: false, // 禁用 X-RateLimit-* headers
    handler: (req, res) => {
        res.status(429).json({
            status: 'error',
            message: '您已超過請求次數限制，請 15 分鐘後再試',
            retryAfter: Math.ceil(req.rateLimit.resetTime / 1000 / 60) // 分鐘
        });
    },
    skip: (req, res) => {
        // 可選：跳過特定條件（例如管理員）
        return false;
    }
});


// ========== Google OAuth 速率限制 ==========
const googleAuthLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 分鐘
    max: 5, // 最多 5 次請求
    message: {
        status: 'error',
        message: 'Google 登入請求過於頻繁，請稍後再試'
    }
});

// ========== 登入速率限制 ==========
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 分鐘
    max: 5, // 最多 5 次嘗試
    message: {
        status: 'error',
        message: '登入嘗試次數過多，請 15 分鐘後再試'
    },
    skipSuccessfulRequests: true // 登入成功時不計入限制
});

// ========== 註冊速率限制 ==========
const signupLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 小時
    max: 2, // 最多 2 次註冊
    message: {
        status: 'error',
        message: '註冊請求過於頻繁，請 1 小時後再試'
    }
});

router.get('/logout', isAuth, (req, res) => {
    res.cookie('jwt', '', { maxAge: 1 }); // 清除 cookie
    res.redirect('/'); // 重定向到登入頁面
});

router.get('/sign_in', (req, res) => {
    res.render('userpage/sign_in');
});

router.post('/sign_in',loginLimiter, async (req, res, next) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ status: 'error', message: '帳號密碼不可為空' });
    }
    const user = await User.findOne({ email }).select('+password');
    const isgoogleoauth = await User.findOne({ email, googleId: { $exists: true } });
    if (isgoogleoauth) {
        return res.status(400).json({ status: 'error', message: '此帳號為 Google OAuth 註冊，請使用 Google 登入' });
    }
    if (!user) {
        return res.status(400).json({ status: 'error', message: '帳號或密碼錯誤' });
    }
    const auth = await bcrypt.compare(password, user.password);
    if (!auth) {
        return res.status(400).json({ status: 'error', message: '帳號或密碼錯誤' });
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

router.post('/sign_up',signupLimiter ,async (req, res, next) => {
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
router.post('/auth/forgot-password', forgotPasswordLimiter, async (req, res) => {
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

        async function sendEmailWithEmailJS(toEmail, userName, resetURL) {
            const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

            const templateParams = {
                email: toEmail,
                user_name: userName,
                reset_url: resetURL,
                from_name: 'TCRS',
            };

            const data = {
                service_id: process.env.EMAILJS_SERVICE_ID,
                template_id: process.env.EMAILJS_TEMPLATE_ID,
                user_id: process.env.EMAILJS_PUBLIC_KEY,
                accessToken: process.env.EMAILJS_PRIVATE_KEY,
                template_params: templateParams
            };

            const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`EmailJS API error: ${response.status} - ${errorText}`);
            }

            return response;
        }

        const resetURL = `${req.protocol}://${req.get('host')}/users/resetPassword/${resetToken}`;

        await sendEmailWithEmailJS(user.email, user.name, resetURL);

        console.log('✅ 郵件通過 EmailJS 發送成功');

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


// google OAuth 登入
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL
},
    async (accessToken, refreshToken, profile, cb) => {
        try {
            // 檢查 email 是否已存在
            let user = await User.findOne({ email: profile.emails[0].value });

            if (user) {
                // 如果 email 已存在，檢查是否有 googleId
                if (!user.googleId) {
                    // Email 存在但沒有 googleId，表示是用密碼註冊的
                    return cb(null, false, { 
                        message: '此 Email 已存在，請使用密碼登入或找回密碼' 
                    });
                }
                // Email 存在且有 googleId，直接登入
                return cb(null, user);
            } else {
                // Email 不存在，創建新用戶
                const newUser = await User.findOneAndUpdate(
                    { googleId: profile.id }, 
                    { 
                        name: profile.displayName, 
                        email: profile.emails[0].value 
                    }, 
                    { upsert: true, new: true }
                );
                return cb(null, newUser);
            }
        } catch (error) {
            console.error('Google OAuth 錯誤:', error);
            return cb(error, null);
        }
    }
));

// 開始 Google OAuth 流程
router.get('/google', googleAuthLimiter, passport.authenticate('google', {
    scope: ['email', 'profile'],
}));

// Google OAuth 回調路由 - 使用自定義回調
router.get('/auth/google/callback', (req, res, next) => {
    passport.authenticate('google', { session: false }, (err, user, info) => {
        // 1. 處理伺服器錯誤
        if (err) {
            console.error('Google OAuth 錯誤:', err);
            return res.status(500).json({
                status: 'error',
                message: '伺服器錯誤，請稍後再試'
            });
        }

        // 2. 處理用戶未通過驗證（包含 email 已存在的情況）
        if (!user) {
            const errorMessage = info && info.message 
                ? info.message 
                : 'Google 登入失敗，請稍後再試';
            
            // 可以重定向到錯誤頁面或返回 JSON
            return res.status(400).json({
                status: 'error',
                message: errorMessage
            });
            
            // 或者重定向到登入頁面並顯示錯誤
            // return res.redirect(`/users/sign_in?error=${encodeURIComponent(errorMessage)}`);
        }

        // 3. 用戶通過驗證，生成 JWT 並設置 cookie
        const token = generateSendJWT(user);
        res.cookie('jwt', token, { 
            httpOnly: true, 
            secure: process.env.NODE_ENV === 'production' 
        });
        res.redirect('/users/profile');
    })(req, res, next);
});
module.exports = router;