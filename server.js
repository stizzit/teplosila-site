const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const TelegramBot = require('node-telegram-bot-api');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// ===== НАСТРОЙКИ =====
const TELEGRAM_TOKEN = '8564447444:AAG4lHszaA2lhXQ6NjwGTxLO5mcyXpyfgnQ';
const ADMIN_CHAT_ID = '1219777106';
const ADMIN_PASSWORD = 'admin123';

function getLocalIp() {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return 'localhost';
}

if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

const storage = multer.diskStorage({
    destination: 'uploads/',
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }));
app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));
app.use('/uploads', express.static('uploads'));

// ===== БАЗА ДАННЫХ =====
const db = new sqlite3.Database('./teplosila.db');
db.run("PRAGMA journal_mode=WAL");

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        parent_id INTEGER,
        sort_order INTEGER DEFAULT 0
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category_id INTEGER,
        subcategory TEXT,
        price REAL,
        old_price REAL,
        unit TEXT DEFAULT 'шт',
        description TEXT,
        image_url TEXT,
        in_stock INTEGER DEFAULT 1,
        is_popular INTEGER DEFAULT 0,
        page TEXT,
        section TEXT,
        tab TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_number TEXT UNIQUE NOT NULL,
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        customer_email TEXT,
        customer_address TEXT,
        comment TEXT,
        items TEXT NOT NULL,
        total REAL NOT NULL,
        status TEXT DEFAULT 'new',
        assigned_to TEXT,
        confirmed_at DATETIME,
        ready_at DATETIME,
        delivered_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS telegram_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT UNIQUE NOT NULL,
        username TEXT,
        first_name TEXT,
        last_name TEXT,
        role TEXT DEFAULT 'staff',
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Администратор
    db.get("SELECT id FROM telegram_users WHERE chat_id = ?", [ADMIN_CHAT_ID], (err, row) => {
        if (!row) {
            db.run("INSERT INTO telegram_users (chat_id, username, first_name, role, is_active) VALUES (?, 'admin', 'Администратор', 'admin', 1)", [ADMIN_CHAT_ID]);
            console.log('✅ Администратор добавлен');
        }
    });

    // Тестовые товары
    db.get("SELECT COUNT(*) as count FROM products", [], (err, row) => {
        if (row && row.count === 0) {
            const products = [
                { name: 'Электрический котел 4.5 кВт', section: 'kotly', tab: 'elektro-kotly', page: 'heating.html', price: 12500, unit: 'шт', description: 'Компактный электрический котел', image_url: 'img/elec.jpg', is_popular: 1 },
                { name: 'Электрический котел 6 кВт', section: 'kotly', tab: 'elektro-kotly', page: 'heating.html', price: 15800, unit: 'шт', description: 'Мощный электрический котел', image_url: 'img/elec.jpg', is_popular: 1 },
                { name: 'Радиатор алюминиевый 60см 10 секций', section: 'radiatory', tab: '60cm', subcategory: 'aluminium', page: 'heating.html', price: 4300, unit: 'комплект', description: 'Алюминиевый радиатор', image_url: 'img/batarey/al10kgTEPLO.png', is_popular: 1 },
                { name: 'ППР труба 20 мм', section: 'truby_santeh', tab: 'ppr', page: 'plumbing.html', price: 95, unit: 'метр', description: 'Для холодной воды', image_url: 'santehnica/ppr_hol.png' },
                { name: 'Смеситель для раковины', section: 'smesiteli', tab: 'rakovina', page: 'plumbing.html', price: 1850, unit: 'шт', description: 'Однорычажный смеситель', image_url: 'https://images.satu.kz/156367877_w640_h640_smesitel-dlya-rakoviny-ledeme.jpg', is_popular: 1 }
            ];
            const stmt = db.prepare("INSERT INTO products (name, section, tab, subcategory, page, price, unit, description, image_url, is_popular) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            products.forEach(p => stmt.run(p.name, p.section, p.tab, p.subcategory || null, p.page, p.price, p.unit, p.description, p.image_url, p.is_popular || 0));
            stmt.finalize();
            console.log('✅ Тестовые товары добавлены');
        }
    });
});

// ===== TELEGRAM БОТ =====
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// Отключаем вебхук
bot.deleteWebHook().then(() => {
    console.log('✅ Telegram бот запущен (polling mode)');
}).catch(err => console.log('⚠️ Ошибка:', err.message));

// Проверка бота
bot.getMe().then((botInfo) => {
    console.log('🤖 Бот активен:', botInfo.username);
}).catch((err) => {
    console.error('❌ Ошибка бота:', err.message);
});

// Функция отправки в Telegram с повторной попыткой
async function sendToTelegram(chatId, message, options = {}) {
    try {
        const result = await bot.sendMessage(chatId, message, { parse_mode: 'Markdown', ...options });
        console.log(`✅ Отправлено в ${chatId}`);
        return result;
    } catch (error) {
        console.error(`❌ Ошибка отправки в ${chatId}:`, error.message);
        // Пробуем без Markdown
        try {
            const plainMessage = message.replace(/\*/g, '').replace(/_/g, '');
            const result = await bot.sendMessage(chatId, plainMessage, options);
            console.log(`✅ Отправлено в ${chatId} (без Markdown)`);
            return result;
        } catch (err2) {
            console.error(`❌ Критическая ошибка ${chatId}:`, err2.message);
            return null;
        }
    }
}

// Вспомогательные функции
function getUser(chatId) {
    return new Promise((resolve) => {
        db.get("SELECT * FROM telegram_users WHERE chat_id = ? AND is_active = 1", [String(chatId)], (err, user) => {
            resolve(user || null);
        });
    });
}

function registerUser(chatId, username, firstName, lastName) {
    return new Promise((resolve) => {
        db.get("SELECT id FROM telegram_users WHERE chat_id = ?", [String(chatId)], (err, existing) => {
            if (existing) {
                db.run("UPDATE telegram_users SET username = ?, first_name = ?, last_name = ?, is_active = 1 WHERE chat_id = ?", [username || '', firstName || '', lastName || '', String(chatId)], () => resolve());
            } else {
                db.run("INSERT INTO telegram_users (chat_id, username, first_name, last_name, is_active) VALUES (?, ?, ?, ?, 1)", [String(chatId), username || '', firstName || '', lastName || ''], () => resolve());
            }
        });
    });
}

function getOrderById(orderId) {
    return new Promise((resolve) => {
        db.get("SELECT * FROM orders WHERE id = ?", [orderId], (err, order) => resolve(order || null));
    });
}

function formatOrderMessage(order) {
    let items = [];
    try { items = JSON.parse(order.items); } catch(e) {}
    
    let message = `📦 ЗАКАЗ #${order.order_number}\n\n`;
    message += `👤 Клиент: ${order.customer_name}\n`;
    message += `📞 Телефон: ${order.customer_phone}\n`;
    if (order.customer_address) message += `📍 Адрес: ${order.customer_address}\n`;
    if (order.comment) message += `💬 Комментарий: ${order.comment}\n`;
    message += `📅 Создан: ${new Date(order.created_at).toLocaleString('ru-RU')}\n\n`;
    
    const statusMap = { 'new': '🆕 НОВЫЙ', 'processing': '⚙️ В СБОРКЕ', 'ready': '✅ ГОТОВ', 'delivered': '✅ ВЫДАН', 'cancelled': '❌ ОТМЕНЁН' };
    message += `📊 Статус: ${statusMap[order.status] || order.status}\n\n`;
    
    message += `📋 ТОВАРЫ:\n`;
    items.forEach((item, i) => {
        message += `${i+1}. ${item.name}\n   ${item.quantity} × ${item.price} = ${item.quantity * item.price} сом\n`;
    });
    message += `\n💰 ИТОГО: ${order.total.toLocaleString()} сом`;
    
    return message;
}

// ===== ОБРАБОТКА КОМАНД =====
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    console.log(`📱 /start от ${chatId}`);
    
    await registerUser(chatId, msg.chat.username, msg.chat.first_name, msg.chat.last_name);
    const user = await getUser(chatId);
    
    if (!user) {
        return sendToTelegram(chatId, `⛔ Нет доступа\nВаш ID: ${chatId}\nПередайте ID администратору.`);
    }
    
    const isAdmin = user.role === 'admin';
    const name = user.first_name || 'пользователь';
    
    const keyboard = isAdmin ? [
        [{ text: '📋 ВСЕ ЗАКАЗЫ' }],
        [{ text: '✅ ГОТОВЫ К ВЫДАЧЕ' }],
        [{ text: '📊 СТАТИСТИКА' }, { text: '👥 СОТРУДНИКИ' }]
    ] : [
        [{ text: '📋 ДОСТУПНЫЕ ЗАКАЗЫ' }],
        [{ text: '👤 МОИ ЗАКАЗЫ' }]
    ];
    
    sendToTelegram(chatId, `👋 Добро пожаловать, ${name}!`, {
        reply_markup: { keyboard, resize_keyboard: true }
    });
});

// Обработка текстовых кнопок
bot.on('message', async (msg) => {
    if (msg.text && msg.text.startsWith('/')) return;
    
    const chatId = msg.chat.id;
    const text = msg.text;
    if (!text) return;
    
    const user = await getUser(chatId);
    if (!user) return;
    
    const isAdmin = user.role === 'admin';
    
    // ДОСТУПНЫЕ ЗАКАЗЫ (для сотрудников)
    if (text === '📋 ДОСТУПНЫЕ ЗАКАЗЫ' && !isAdmin) {
        db.all("SELECT * FROM orders WHERE status IN ('new', 'processing') AND (assigned_to IS NULL OR assigned_to = ?) ORDER BY created_at DESC LIMIT 10", [String(chatId)], async (err, orders) => {
            if (!orders || orders.length === 0) return sendToTelegram(chatId, '📭 Нет доступных заказов');
            sendToTelegram(chatId, `📋 ДОСТУПНЫЕ ЗАКАЗЫ (${orders.length})`);
            for (const order of orders) {
                const message = formatOrderMessage(order);
                const buttons = [];
                if (order.status === 'new' && !order.assigned_to) buttons.push([{ text: '👤 ВЗЯТЬ', callback_data: `take_${order.id}` }]);
                else if (order.status === 'new' && order.assigned_to === String(chatId)) buttons.push([{ text: '✅ ПОДТВЕРДИТЬ', callback_data: `confirm_${order.id}` }]);
                else if (order.status === 'processing' && order.assigned_to === String(chatId)) buttons.push([{ text: '📦 ГОТОВ', callback_data: `ready_${order.id}` }]);
                await sendToTelegram(chatId, message, buttons.length ? { reply_markup: { inline_keyboard: buttons } } : {});
            }
        });
    }
    
    // МОИ ЗАКАЗЫ (для сотрудников)
    else if (text === '👤 МОИ ЗАКАЗЫ' && !isAdmin) {
        db.all("SELECT * FROM orders WHERE assigned_to = ? AND status IN ('new', 'processing', 'ready') ORDER BY created_at DESC", [String(chatId)], async (err, orders) => {
            if (!orders || orders.length === 0) return sendToTelegram(chatId, '📭 У вас нет активных заказов');
            sendToTelegram(chatId, `👤 ВАШИ ЗАКАЗЫ (${orders.length})`);
            for (const order of orders) {
                const message = formatOrderMessage(order);
                const buttons = [];
                if (order.status === 'new') buttons.push([{ text: '✅ ПОДТВЕРДИТЬ', callback_data: `confirm_${order.id}` }]);
                else if (order.status === 'processing') buttons.push([{ text: '📦 ГОТОВ', callback_data: `ready_${order.id}` }]);
                await sendToTelegram(chatId, message, buttons.length ? { reply_markup: { inline_keyboard: buttons } } : {});
            }
        });
    }
    
    // ВСЕ ЗАКАЗЫ (для админа)
    else if (text === '📋 ВСЕ ЗАКАЗЫ' && isAdmin) {
        db.all("SELECT * FROM orders WHERE status IN ('new', 'processing', 'ready') ORDER BY created_at DESC LIMIT 20", async (err, orders) => {
            if (!orders || orders.length === 0) return sendToTelegram(chatId, '📭 Нет активных заказов');
            sendToTelegram(chatId, `📋 ВСЕ АКТИВНЫЕ ЗАКАЗЫ (${orders.length})`);
            for (const order of orders) {
                const message = formatOrderMessage(order);
                const buttons = [];
                if (order.status === 'ready') buttons.push([{ text: '✅ ВЫДАТЬ', callback_data: `deliver_${order.id}` }]);
                if (order.status !== 'delivered' && order.status !== 'cancelled') buttons.push([{ text: '❌ ОТМЕНИТЬ', callback_data: `cancel_${order.id}` }]);
                await sendToTelegram(chatId, message, buttons.length ? { reply_markup: { inline_keyboard: buttons } } : {});
            }
        });
    }
    
    // ГОТОВЫ К ВЫДАЧЕ (для админа)
    else if (text === '✅ ГОТОВЫ К ВЫДАЧЕ' && isAdmin) {
        db.all("SELECT * FROM orders WHERE status = 'ready' ORDER BY ready_at ASC", async (err, orders) => {
            if (!orders || orders.length === 0) return sendToTelegram(chatId, '✅ Нет готовых заказов');
            sendToTelegram(chatId, `✅ ГОТОВЫ К ВЫДАЧЕ (${orders.length})`);
            for (const order of orders) {
                const message = formatOrderMessage(order);
                const buttons = [[{ text: '✅ ВЫДАТЬ', callback_data: `deliver_${order.id}` }], [{ text: '❌ ОТМЕНИТЬ', callback_data: `cancel_${order.id}` }]];
                await sendToTelegram(chatId, message, { reply_markup: { inline_keyboard: buttons } });
            }
        });
    }
    
    // СТАТИСТИКА (для админа)
    else if (text === '📊 СТАТИСТИКА' && isAdmin) {
        db.get("SELECT COUNT(*) as products FROM products", (err, p) => {
            db.get("SELECT COUNT(*) as new FROM orders WHERE status='new'", (err, n) => {
                db.get("SELECT COUNT(*) as proc FROM orders WHERE status='processing'", (err, pr) => {
                    db.get("SELECT COUNT(*) as ready FROM orders WHERE status='ready'", (err, r) => {
                        db.get("SELECT COUNT(*) as delivered FROM orders WHERE status='delivered'", (err, d) => {
                            db.get("SELECT COALESCE(SUM(total),0) as rev FROM orders WHERE status='delivered'", (err, rev) => {
                                let message = `📊 СТАТИСТИКА\n\n📦 Товаров: ${p?.products || 0}\n🆕 Новых: ${n?.new || 0}\n⚙️ В сборке: ${pr?.proc || 0}\n✅ Готовых: ${r?.ready || 0}\n📦 Выдано: ${d?.delivered || 0}\n💰 Выручка: ${(rev?.rev || 0).toLocaleString()} сом`;
                                sendToTelegram(chatId, message);
                            });
                        });
                    });
                });
            });
        });
    }
    
    // СОТРУДНИКИ (для админа)
    else if (text === '👥 СОТРУДНИКИ' && isAdmin) {
        db.all("SELECT * FROM telegram_users ORDER BY role DESC, is_active DESC", (err, users) => {
            let message = '👥 СОТРУДНИКИ\n\n';
            for (const u of users) {
                const status = u.is_active ? '✅' : '❌';
                const role = u.role === 'admin' ? '👑 Админ' : '👤 Сборщик';
                const name = u.first_name || u.username || 'Без имени';
                message += `${status} ${role}: ${name}\n🆔 ${u.chat_id}\n\n`;
            }
            message += `/adduser ID - добавить\n/removeuser ID - удалить`;
            sendToTelegram(chatId, message);
        });
    }
});

// ===== ОБРАБОТКА INLINE КНОПОК =====
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    
    const user = await getUser(chatId);
    if (!user) return bot.answerCallbackQuery(query.id, { text: '⛔ Нет доступа', show_alert: true });
    
    const isAdmin = user.role === 'admin';
    const parts = data.split('_');
    const action = parts[0];
    const orderId = parseInt(parts[1]);
    
    const order = await getOrderById(orderId);
    if (!order) return bot.answerCallbackQuery(query.id, { text: '❌ Заказ не найден' });
    
    // ВЗЯТЬ В РАБОТУ
    if (action === 'take') {
        if (order.assigned_to && order.assigned_to !== String(chatId)) {
            return bot.answerCallbackQuery(query.id, { text: '⚠️ Занят другим', show_alert: true });
        }
        db.run("UPDATE orders SET assigned_to = ? WHERE id = ?", [String(chatId), orderId], async (err) => {
            if (err) return bot.answerCallbackQuery(query.id, { text: '❌ Ошибка' });
            await bot.answerCallbackQuery(query.id, { text: '✅ Заказ взят!' });
            const updatedOrder = await getOrderById(orderId);
            const newMessage = formatOrderMessage(updatedOrder);
            const buttons = [[{ text: '✅ ПОДТВЕРДИТЬ', callback_data: `confirm_${orderId}` }]];
            await bot.editMessageText(newMessage, { chat_id: chatId, message_id: query.message.message_id, reply_markup: { inline_keyboard: buttons } }).catch(() => {});
            sendToTelegram(ADMIN_CHAT_ID, `👤 Сотрудник взял заказ #${order.order_number}\n👤 ${order.customer_name}\n💰 ${order.total.toLocaleString()} сом`);
        });
    }
    
    // ПОДТВЕРДИТЬ
    else if (action === 'confirm') {
        if (order.assigned_to !== String(chatId)) return bot.answerCallbackQuery(query.id, { text: '⛔ Не ваш заказ', show_alert: true });
        const now = new Date().toISOString();
        db.run("UPDATE orders SET status = 'processing', confirmed_at = ? WHERE id = ?", [now, orderId], async (err) => {
            if (err) return bot.answerCallbackQuery(query.id, { text: '❌ Ошибка' });
            await bot.answerCallbackQuery(query.id, { text: '⚙️ В сборке!' });
            const updatedOrder = await getOrderById(orderId);
            const newMessage = formatOrderMessage(updatedOrder);
            const buttons = [[{ text: '📦 ГОТОВ', callback_data: `ready_${orderId}` }]];
            await bot.editMessageText(newMessage, { chat_id: chatId, message_id: query.message.message_id, reply_markup: { inline_keyboard: buttons } }).catch(() => {});
            sendToTelegram(ADMIN_CHAT_ID, `⚙️ Заказ #${order.order_number} в сборке\n👤 ${order.customer_name}`);
        });
    }
    
    // ГОТОВ
    else if (action === 'ready') {
        if (order.assigned_to !== String(chatId)) return bot.answerCallbackQuery(query.id, { text: '⛔ Не ваш заказ', show_alert: true });
        const now = new Date().toISOString();
        db.run("UPDATE orders SET status = 'ready', ready_at = ? WHERE id = ?", [now, orderId], async (err) => {
            if (err) return bot.answerCallbackQuery(query.id, { text: '❌ Ошибка' });
            await bot.answerCallbackQuery(query.id, { text: '✅ Заказ готов!' });
            const updatedOrder = await getOrderById(orderId);
            const newMessage = formatOrderMessage(updatedOrder);
            await bot.editMessageText(newMessage, { chat_id: chatId, message_id: query.message.message_id }).catch(() => {});
            sendToTelegram(ADMIN_CHAT_ID, `✅ ЗАКАЗ ГОТОВ!\n📦 #${order.order_number}\n👤 ${order.customer_name}\n📞 ${order.customer_phone}\n💰 ${order.total.toLocaleString()} сом`);
        });
    }
    
    // ВЫДАТЬ
    else if (action === 'deliver') {
        if (!isAdmin) return bot.answerCallbackQuery(query.id, { text: '⛔ Только админ', show_alert: true });
        const now = new Date().toISOString();
        db.run("UPDATE orders SET status = 'delivered', delivered_at = ? WHERE id = ?", [now, orderId], async (err) => {
            if (err) return bot.answerCallbackQuery(query.id, { text: '❌ Ошибка' });
            await bot.answerCallbackQuery(query.id, { text: '✅ Заказ выдан!' });
            const updatedOrder = await getOrderById(orderId);
            const newMessage = formatOrderMessage(updatedOrder);
            await bot.editMessageText(newMessage + '\n\n✅ ЗАКАЗ ВЫДАН', { chat_id: chatId, message_id: query.message.message_id }).catch(() => {});
            if (order.assigned_to) sendToTelegram(order.assigned_to, `🎉 Заказ #${order.order_number} ВЫДАН!`);
        });
    }
    
    // ОТМЕНИТЬ
    else if (action === 'cancel') {
        if (!isAdmin) return bot.answerCallbackQuery(query.id, { text: '⛔ Только админ', show_alert: true });
        db.run("UPDATE orders SET status = 'cancelled' WHERE id = ?", [orderId], async (err) => {
            if (err) return bot.answerCallbackQuery(query.id, { text: '❌ Ошибка' });
            await bot.answerCallbackQuery(query.id, { text: '❌ Заказ отменён' });
            const updatedOrder = await getOrderById(orderId);
            const newMessage = formatOrderMessage(updatedOrder);
            await bot.editMessageText(newMessage + '\n\n❌ ЗАКАЗ ОТМЕНЁН', { chat_id: chatId, message_id: query.message.message_id }).catch(() => {});
            if (order.assigned_to) sendToTelegram(order.assigned_to, `❌ Заказ #${order.order_number} отменён`);
        });
    }
    
    bot.answerCallbackQuery(query.id);
});

// ===== КОМАНДЫ АДМИНА =====
bot.onText(/\/adduser (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const user = await getUser(chatId);
    if (!user || user.role !== 'admin') return sendToTelegram(chatId, '⛔ Только администратор');
    
    const newChatId = match[1].trim();
    db.get("SELECT id FROM telegram_users WHERE chat_id = ?", [newChatId], (err, existing) => {
        if (existing) {
            db.run("UPDATE telegram_users SET is_active = 1, role = 'staff' WHERE chat_id = ?", [newChatId], () => {
                sendToTelegram(chatId, '✅ Сотрудник активирован!');
                sendToTelegram(newChatId, '🎉 Вас добавили в ТЕПЛОСИЛА!\nНажмите /start');
            });
        } else {
            db.run("INSERT INTO telegram_users (chat_id, role, is_active, first_name) VALUES (?, 'staff', 1, 'Сотрудник')", [newChatId], () => {
                sendToTelegram(chatId, '✅ Сотрудник добавлен!');
                sendToTelegram(newChatId, '🎉 Вас добавили в ТЕПЛОСИЛА!\nНажмите /start');
            });
        }
    });
});

bot.onText(/\/removeuser (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const user = await getUser(chatId);
    if (!user || user.role !== 'admin') return sendToTelegram(chatId, '⛔ Только администратор');
    
    const removeChatId = match[1].trim();
    db.run("UPDATE telegram_users SET is_active = 0 WHERE chat_id = ?", [removeChatId], function(err) {
        if (err || this.changes === 0) return sendToTelegram(chatId, '❌ Сотрудник не найден');
        sendToTelegram(chatId, '✅ Сотрудник удалён');
        sendToTelegram(removeChatId, '❌ Ваш доступ отозван');
    });
});

// ===== API РОУТЫ =====
app.get('/api/products', (req, res) => {
    let query = "SELECT * FROM products WHERE 1=1";
    const params = [];
    if (req.query.page) { query += " AND page = ?"; params.push(req.query.page); }
    if (req.query.section) { query += " AND section = ?"; params.push(req.query.section); }
    if (req.query.tab) { query += " AND tab = ?"; params.push(req.query.tab); }
    query += " ORDER BY sort_order, created_at DESC";
    db.all(query, params, (err, rows) => res.json(rows || []));
});

app.get('/api/products/:id', (req, res) => {
    db.get("SELECT * FROM products WHERE id = ?", req.params.id, (err, row) => res.json(row));
});

app.post('/api/products', upload.single('image'), (req, res) => {
    const p = req.body;
    if (req.file) p.image_url = '/uploads/' + req.file.filename;
    db.run(`INSERT INTO products (name, category_id, subcategory, price, old_price, unit, description, image_url, in_stock, is_popular, page, section, tab, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [p.name, p.category_id || null, p.subcategory || null, p.price || 0, p.old_price || null, p.unit || 'шт', p.description || '', p.image_url || null, p.in_stock ? 1 : 0, p.is_popular ? 1 : 0, p.page || null, p.section || null, p.tab || null, p.sort_order || 0],
        function(err) { err ? res.status(500).json({ error: err.message }) : res.json({ id: this.lastID }); });
});

app.put('/api/products/:id', upload.single('image'), (req, res) => {
    const p = req.body;
    if (req.file) p.image_url = '/uploads/' + req.file.filename;
    db.get("SELECT image_url FROM products WHERE id = ?", [req.params.id], (err, existing) => {
        const imageUrl = p.image_url || (existing ? existing.image_url : null);
        db.run(`UPDATE products SET name=?, category_id=?, subcategory=?, price=?, old_price=?, unit=?, description=?, image_url=?, in_stock=?, is_popular=?, page=?, section=?, tab=?, sort_order=? WHERE id=?`,
            [p.name, p.category_id || null, p.subcategory || null, p.price || 0, p.old_price || null, p.unit || 'шт', p.description || '', imageUrl, p.in_stock ? 1 : 0, p.is_popular ? 1 : 0, p.page || null, p.section || null, p.tab || null, p.sort_order || 0, req.params.id],
            (err) => err ? res.status(500).json({ error: err.message }) : res.json({ success: true }));
    });
});

app.delete('/api/products/:id', (req, res) => {
    db.run("DELETE FROM products WHERE id = ?", req.params.id, (err) => res.json({ success: !err }));
});

// ГЛАВНЫЙ API ЗАКАЗОВ - ОТПРАВКА В TELEGRAM
app.post('/api/orders', (req, res) => {
    const { customer_name, customer_phone, customer_email, customer_address, comment, items, total } = req.body;
    const orderNumber = 'ORD-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    
    console.log('\n' + '='.repeat(50));
    console.log('🛒 НОВЫЙ ЗАКАЗ!');
    console.log('='.repeat(50));
    console.log(`📦 Номер: ${orderNumber}`);
    console.log(`👤 Клиент: ${customer_name}`);
    console.log(`📞 Телефон: ${customer_phone}`);
    console.log(`📍 Адрес: ${customer_address || 'не указан'}`);
    console.log(`💰 Сумма: ${total} сом`);
    console.log(`📋 Товаров: ${items?.length || 0}`);
    console.log('='.repeat(50));
    
    db.run(`INSERT INTO orders (order_number, customer_name, customer_phone, customer_email, customer_address, comment, items, total, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new')`,
        [orderNumber, customer_name, customer_phone, customer_email || null, customer_address || null, comment || null, JSON.stringify(items), total],
        async function(err) {
            if (err) {
                console.error('❌ Ошибка БД:', err);
                return res.status(500).json({ error: err.message });
            }
            
            console.log('✅ Заказ сохранён, ID:', this.lastID);
            
            // Формируем сообщение
            let itemsText = '';
            items.forEach((item, i) => {
                itemsText += `${i+1}. ${item.name} - ${item.quantity} × ${item.price} = ${item.quantity * item.price} сом\n`;
            });
            
            const message = `🛒 НОВЫЙ ЗАКАЗ!\n\n📦 #${orderNumber}\n👤 ${customer_name}\n📞 ${customer_phone}\n${customer_address ? `📍 ${customer_address}\n` : ''}${comment ? `💬 ${comment}\n` : ''}\n📋 Товары:\n${itemsText}\n💰 ИТОГО: ${total.toLocaleString()} сом\n\n🕐 ${new Date().toLocaleString('ru-RU')}`;
            
            // Отправляем админу
            console.log('📤 Отправка админу...');
            const result = await sendToTelegram(ADMIN_CHAT_ID, message);
            if (result) {
                console.log('✅ Уведомление админу отправлено!');
            } else {
                console.log('❌ НЕ УДАЛОСЬ отправить админу!');
            }
            
            // Отправляем сотрудникам
            db.all("SELECT chat_id FROM telegram_users WHERE is_active = 1 AND role = 'staff'", (err, users) => {
                if (users && users.length > 0) {
                    const staffMsg = `🛒 НОВЫЙ ЗАКАЗ #${orderNumber}\n👤 ${customer_name}\n📞 ${customer_phone}\n💰 ${total.toLocaleString()} сом`;
                    users.forEach(user => {
                        sendToTelegram(user.chat_id, staffMsg);
                    });
                }
            });
            
            res.json({ success: true, order_number: orderNumber });
        });
});

app.get('/api/orders', (req, res) => {
    db.all("SELECT * FROM orders ORDER BY created_at DESC", (err, rows) => {
        const orders = (rows || []).map(o => {
            try { return { ...o, items: JSON.parse(o.items) }; }
            catch(e) { return { ...o, items: [] }; }
        });
        res.json(orders);
    });
});

app.put('/api/orders/:id/status', (req, res) => {
    const { status } = req.body;
    const now = new Date().toISOString();
    let query = "UPDATE orders SET status = ?";
    const params = [status];
    if (status === 'processing') { query += ", confirmed_at = ?"; params.push(now); }
    else if (status === 'ready') { query += ", ready_at = ?"; params.push(now); }
    else if (status === 'delivered') { query += ", delivered_at = ?"; params.push(now); }
    query += " WHERE id = ?";
    params.push(req.params.id);
    db.run(query, params, (err) => res.json({ success: !err }));
});

app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) res.json({ success: true });
    else res.status(401).json({ error: 'Неверный пароль' });
});

app.get('/api/admin/stats', (req, res) => {
    db.get("SELECT COUNT(*) as products FROM products", (err, p) => {
        db.get("SELECT COUNT(*) as orders FROM orders WHERE status != 'delivered' AND status != 'cancelled'", (err, o) => {
            db.get("SELECT COALESCE(SUM(total),0) as rev FROM orders WHERE status = 'delivered'", (err, r) => {
                res.json({ products: p?.products || 0, orders: o?.orders || 0, revenue: r?.rev || 0 });
            });
        });
    });
});

// ===== ЗАПУСК =====
const localIp = getLocalIp();
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Сервер запущен!`);
    console.log(`📱 На телефоне: http://${localIp}:${PORT}`);
    console.log(`💻 На ПК: http://localhost:${PORT}`);
    console.log(`🔑 Админка: /admin-login.html`);
});

// Тест отправки при запуске
setTimeout(async () => {
    console.log('📤 Тестовая отправка админу...');
    await sendToTelegram(ADMIN_CHAT_ID, '✅ Сервер запущен! Бот готов к работе.');
}, 3000);