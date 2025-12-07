const mongoose = require('mongoose');
const Pathoflegend = require('../models/pathoflegend');
const dotenv = require('dotenv');
const path = require('path');

// 載入環境變數
dotenv.config({ path: path.resolve(__dirname, '../../config.env') });



// 連接資料庫
async function connectDB() {
    try {
        mongoose.set('strictQuery', true);
        const DB = process.env.DATABASE.replace('<db_password>', process.env.DATABASE_PASSWORD); //連接資料庫
        await mongoose.connect(DB);
        console.log('✅ 資料庫連線成功');
        console.log('資料庫名稱:', mongoose.connection.name);
    } catch (error) {
        console.error('❌ 資料庫連線失敗:', error);
        process.exit(1);
    }
}

// 獲取並儲存單個玩家資料
async function fetchAndSavePlayer() {
    try {
        const response = await fetch(
            `https://api.clashroyale.com/v1/locations/global/pathoflegend/2025-06/rankings/players?limit=10000`,
            {
                headers: {
                    'Authorization': `Bearer ${process.env.API_KEY}`
                }
            }
        );

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        await Promise.all(data.items.map(async (player) => {
            const tag = player.tag;
            const eloRating =  player.eloRating;
            const rank= player.rank;
            const season= '2025-06';
            await Pathoflegend.findOneAndUpdate(
                { tag: tag, season: season },
                { tag: tag, eloRating: eloRating, rank: rank, season: season },
                { upsert: true, new: true }
            );
        }));
        console.log('✅ 所有玩家資料已處理完成');
        await closeDB();
    }
    catch (error) {
        console.error(`❌ 無法獲取玩家 ${player} 的資料:`, error);
        return false;
    }
}

// 關閉資料庫連接
async function closeDB() {
    try {
        await mongoose.connection.close();
        console.log('✅ 資料庫連線已關閉');
    } catch (error) {
        console.error('❌ 關閉資料庫連線時發生錯誤:', error);
    }
}

// 主程式
async function main() {
    await connectDB();
    await fetchAndSavePlayer();
}

// 執行主程式
main().catch(error => {
    console.error('程式執行錯誤:', error);
    process.exit(1);
});
