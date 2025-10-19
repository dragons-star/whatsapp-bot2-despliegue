require("dotenv").config();
const qrcode = require('qrcode');
const { Client, LocalAuth } = require('whatsapp-web.js');
const nodemailer = require("nodemailer");

console.log("Iniciando el bot...");

// --- Configuración del Cliente de WhatsApp (con optimizaciones de memoria) ---
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process', // Clave para reducir la RAM
            '--disable-gpu'
        ],
    }
});

// --- Eventos del Cliente de WhatsApp ---

// Genera una URL con la imagen del QR para evitar errores en la consola
client.on('qr', qr => {
    console.log("--------------------------------------------------");
    console.log("Se generó un código QR.");
    console.log("Copia el SIGUIENTE enlace completo en tu navegador para verlo y escanearlo:");
    qrcode.toDataURL(qr, (err, url) => {
        if (err) {
            console.error("Error al generar la URL del QR:", err);
        } else {
            console.log(url);
            console.log("--------------------------------------------------");
        }
    });
});

client.on('authenticated', () => {
    console.log('Autenticación exitosa.');
});

client.on('ready', () => {
    console.log('¡Cliente de WhatsApp listo y conectado!');
});

// Manejo de desconexiones para intentar recuperar la sesión
client.on('disconnected', (reason) => {
    console.log('¡Cliente desconectado!', reason);
    console.log('Intentando reiniciar la sesión...');
    client.initialize();
});

// --- Lógica Principal del Bot ---
client.on('message', async message => {
    try {
        if (message.fromMe) return;

        const chat = await message.getChat();
        const contact = await message.getContact();
        const originalMessage = message.body || '';
        const from = message.from || '';
        const pushname = contact.pushname || 'Desconocido';

        if (!originalMessage || !from) return;

        const aiWhatsappNumber = process.env.AI_WHATSAPP_NUMBER;
        if (from === aiWhatsappNumber) {
            if (isAwaitingAIReply && pendingQueryInfo) {
                const { from: originalFrom, pushname: originalPushname } = pendingQueryInfo;
                const responseWithSignature = `*Para ${originalPushname}:*\n${originalMessage}`;
                await sendMessageWithRetry(originalFrom, responseWithSignature);
                isAwaitingAIReply = false;
                pendingQueryInfo = null;
            }
            return;
        }

        const isGroup = chat.isGroup;
        const tuNumero = client.info.wid.user;

        console.log(`\n--- NUEVO MENSAJE de ${pushname} en ${from}: "${originalMessage}"`);

        const mentions = await message.getMentions();
        const meMencionaron = mentions.some(mention => mention.id.user === tuNumero);
        const respuestaEspecifica = obtenerRespuestaEspecifica(originalMessage);
        const esUnSaludoSimple = esSaludo(originalMessage);

        if ((isGroup && gruposPermitidos.includes(from)) || !isGroup) {
            if (respuestaEspecifica) {
                console.log("Lógica: Coincidencia con diccionario encontrada.");
                await sendMessageWithRetry(from, respuestaEspecifica);
                if (isGroup) enviarEmail("hugo.romero@claro.com.co", `Reporte de '${originalMessage}'`, `Mensaje de ${pushname} en ${from}: ${originalMessage}`);
            } else if (meMencionaron) {
                console.log(`Lógica: Mención para IA detectada.`);
                if (isGroup) enviarEmail("hugo.romero@claro.com.co", `Mención para IA en ${from}`, `Mensaje de ${pushname}: ${originalMessage}`);
                await consultarIA_via_WhatsApp(originalMessage, from, pushname);
            } else if (esUnSaludoSimple && puedeSaludar(from, pushname)) {
                console.log("Lógica: Saludo simple y personalizado detectado.");
                await sendMessageWithRetry(from, obtenerSaludo(pushname));
            }
        }
    } catch (error) {
        console.error("Error grave en el evento 'message':", error);
    }
});

client.initialize();

// --- FUNCIONES DE AYUDA ---

// Función para añadir una pausa
const delay = ms => new Promise(res => setTimeout(res, ms));

async function sendMessageWithRetry(to, text) {
    try {
        // Acortamos el log para que no sea tan largo
        console.log(`Intentando enviar a ${to}: "${text.substring(0, 70)}..."`);
        await client.sendMessage(to, text);
        console.log("Mensaje enviado exitosamente.");
    } catch (error) {
        console.error(`Error al enviar mensaje a ${to}:`, error.message);
    }
}

async function consultarIA_via_WhatsApp(userMessage, originalFrom, pushname) {
    const aiWhatsappNumber = process.env.AI_WHATSAPP_NUMBER;
    if (!aiWhatsappNumber) {
        await sendMessageWithRetry(originalFrom, "La IA no está configurada.");
        return;
    }

    if (isAwaitingAIReply) {
        await sendMessageWithRetry(originalFrom, "🧑‍💻 Por favor un momento, estoy con otra consulta.");
        return;
    }

    isAwaitingAIReply = true;
    pendingQueryInfo = { from: originalFrom, pushname: pushname };

    // 1. Enviar mensaje de espera al usuario
    await sendMessageWithRetry(originalFrom, "🤖 Estamos revisando, un momento por favor...");

    // 2. LA MODIFICACIÓN CLAVE: Esperar 1 segundo para darle un respiro al sistema
    console.log("Haciendo una pausa de 1 segundo antes de contactar a la IA...");
    await delay(1000);

    // 3. Formular y enviar el prompt a la IA
    const prompt = `Actúa como Hugo Romero, un experto en telecomunicaciones. Responde en primera persona y dirígete a tu colega por su nombre '${pushname}'. Tu colega te pregunta: "${userMessage}"`;
    await sendMessageWithRetry(aiWhatsappNumber, prompt);
}

// --- Variables Globales y Configuración ---
let isAwaitingAIReply = false;
let pendingQueryInfo = null;
let lastGreetingTime = {};
const COOLDOWN_PERIOD_MS = 60 * 60 * 1000;

const gruposPermitidos = [
    "573124138249-1633615578@g.us", "573144117449-1420163618@g.us", "1579546575@g.us",
    "1390082199@g.us", "1410194235@g.us", "120363043316977258@g.us",
    "120363042095724140@g.us", "120363420822895904@g.us"
];

const respuestasPorGrupo = {
    "573124138249-1633615578@g.us": {
        "caídas las ingestas": "Se procederá a revisar al interno, por favor en paralelo escalarlo al equipo de GSOC para que nos indiquen los ID´s de las rutas.",
        "tenemos degradación": "Se procederá a revisar internamente.",
        "pixelados": "Procederemos a revisarlo.",
        "pixelaciones": "Procederemos a revisarlo.",
        "afectación en": "Se procederá a revisar al interno, por favor en paralelo escalarlo al equipo de GSOC para que nos indiquen los ID´s de las rutas.",
        "degradación de ingestas": "Se procederá a revisar al interno, por favor en paralelo escalarlo al equipo de GSOC para que nos indiquen los ID´s de las rutas.",
        "notamos el enlace intermitente": "Se procederá a revisar, por favor en paralelo escalarlo al equipo de GSOC para que nos indiquen los ID´s de las rutas.",
        "favor de verificar": "Se procederá a revisar, un momento por favor mientras lo revisamos.",
        "pixelaciones en los": "Se procederá a revisar al interno de manera prioritaria, por favor en paralelo escalarlo al equipo de GSOC para que nos indiquen los ID´s de las rutas.",
        "sin trafico": "Se procederá a revisar al interno de manera prioritaria, por favor en paralelo escalarlo al equipo de GSOC para que nos indiquen los ID´s de las rutas.",
        "degradacíon": "Se procederá a revisar al interno, por favor en paralelo escalarlo al equipo de GSOC para que nos indiquen los ID´s de las rutas.",
    },
    "573144117449-1420163618@g.us": {
        "viejo Hugo": "Ok enterado, procedere",
        "Buenos días compañeros cómo va todo": "Buen día todo en orden hasta el momento",
        "afectación de servicio": "procederemos a revisarlo, un momento por favor",
    },
};

const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

const palabrasSaludo = ["hola", "saludos", "viejo Hugo", "buen dia", "buenas", "buenas tardes", "buenas noches", "buenos dias"];

function enviarEmail(to, subject, text) {
    const mailOptions = { from: process.env.EMAIL_USER, to, subject, text };
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) console.log("Error enviando email: ", error);
        else console.log("Email enviado: " + info.response);
    });
}

function normalizarTexto(texto) {
    if (typeof texto !== 'string') return '';
    return texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function obtenerSaludo(pushname) {
    const hora = new Date().toLocaleString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", hour12: false });
    let saludoBase;
    if (hora < 12) { saludoBase = "¡Buen día"; }
    else if (hora < 18) { saludoBase = "¡Buenas tardes"; }
    else { saludoBase = "¡Buenas noches"; }
    return pushname && pushname !== 'Desconocido' ? `${saludoBase}, ${pushname}!` : `${saludoBase}!`;
}

function esSaludo(mensaje) {
    return palabrasSaludo.some(saludo => normalizarTexto(mensaje).includes(saludo));
}

function puedeSaludar(from, pushname) {
    const uniqueKey = `${from}_${pushname}`;
    const currentTime = new Date().getTime();
    if (!lastGreetingTime[uniqueKey] || currentTime - lastGreetingTime[uniqueKey] > COOLDOWN_PERIOD_MS) {
        lastGreetingTime[uniqueKey] = currentTime;
        return true;
    }
    return false;
}

function obtenerRespuestaEspecifica(mensaje) {
    for (const key in respuestasPorGrupo) {
        const respuestas = respuestasPorGrupo[key];
        for (const [clave, respuesta] of Object.entries(respuestas)) {
            if (normalizarTexto(mensaje).includes(normalizarTexto(clave))) return respuesta;
        }
    }
    return null;
}
