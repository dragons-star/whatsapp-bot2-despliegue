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
        // Argumentos para reducir el consumo de memoria en entornos como Render
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process', // <- Este es muy importante para reducir la RAM
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

client.on('authenticated', () => { console.log('Autenticación exitosa.'); });
client.on('ready', () => { console.log('¡Cliente de WhatsApp listo y conectado!'); });

// --- Lógica Principal del Bot ---
client.on('message', async message => {
    if (message.fromMe) return;

    const contact = await message.getContact();
    const chat = await message.getChat();

    const originalMessage = message.body || '';
    const from = message.from || '';
    const pushname = contact.pushname || 'Desconocido';

    if (!originalMessage || !from) return;

    const aiWhatsappNumber = process.env.AI_WHATSAPP_NUMBER; 
    if (from === aiWhatsappNumber) {
        console.log(`Respuesta recibida de la IA: "${originalMessage}"`);
        if (isAwaitingAIReply && pendingQueryInfo) {
            const { from: originalFrom, pushname: originalPushname } = pendingQueryInfo;
            const responseWithSignature = `*Para ${originalPushname}:*\n${originalMessage}`;
            client.sendMessage(originalFrom, responseWithSignature);

            const contextKey = `${originalFrom}_${originalPushname}`;
            conversationContext[contextKey] = { lastMessage: originalMessage, timestamp: Date.now() };

            isAwaitingAIReply = false;
            pendingQueryInfo = null;
            console.log(`IA ahora está 'disponible'.`);
        }
        return;
    }

    const isGroup = chat.isGroup;
    const tuNumero = client.info.wid.user;

    console.log(`\n--- NUEVO MENSAJE ---`);
    console.log(`Recibido de ${pushname} en ${from}: "${originalMessage}"`);

    const fueMencionado = await message.getMentions();
    const meMencionaron = fueMencionado.some(mention => mention.id.user === tuNumero);
    const respuestaEspecifica = obtenerRespuestaEspecifica(originalMessage);
    const esUnSaludoSimple = esSaludo(originalMessage);
    const contextKey = `${from}_${pushname}`;

    if ((isGroup && gruposPermitidos.includes(from)) || !isGroup) {
        if (conversationContext[contextKey] && (Date.now() - conversationContext[contextKey].timestamp < CONTEXT_TIMEOUT)) {
            const history = `Mi última respuesta a ${pushname} fue: "${conversationContext[contextKey].lastMessage}"`;
            delete conversationContext[contextKey]; 
            consultarIA_via_WhatsApp(originalMessage, from, pushname, history);
        } else if (respuestaEspecifica) {
            console.log("Lógica: Coincidencia con diccionario encontrada.");
            client.sendMessage(from, respuestaEspecifica);
            if (isGroup) {
                enviarEmail("hugo.romero@claro.com.co", `Reporte de '${originalMessage}'`, `Mensaje de ${pushname} en ${from}: ${originalMessage}`);
            }
        } else if (meMencionaron) {
             console.log(`Lógica: Mención para IA detectada de ${pushname}.`);
            if (isGroup) {
                enviarEmail("hugo.romero@claro.com.co", `Mención para IA en ${from}`, `Mensaje de ${pushname}: ${originalMessage}`);
            }
            consultarIA_via_WhatsApp(originalMessage, from, pushname);
        } else if (esUnSaludoSimple && puedeSaludar(from, pushname)) {
            console.log("Lógica: Saludo simple y personalizado detectado.");
            client.sendMessage(from, obtenerSaludo(pushname));
        }
    }
});

client.initialize();

// --- FUNCIONES DE AYUDA Y CONFIGURACIONES GLOBALES ---
let isAwaitingAIReply = false;
let pendingQueryInfo = null;
let conversationContext = {}; 
const CONTEXT_TIMEOUT = 3 * 60 * 1000;
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
    "pixelados": "Procederemos a revisarlo.", "pixelaciones": "Procederemos a revisarlo.",
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
  host: "smtp.gmail.com", port: 587, secure: false,
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

function consultarIA_via_WhatsApp(userMessage, originalFrom, pushname, conversationHistory = "") {
    const aiWhatsappNumber = process.env.AI_WHATSAPP_NUMBER;
    if (!aiWhatsappNumber) { client.sendMessage(originalFrom, "La IA no está configurada."); return; }
    if (isAwaitingAIReply) { client.sendMessage(originalFrom, "🧑‍💻 Por favor un momento, estoy con otra consulta."); return; }
    isAwaitingAIReply = true;
    pendingQueryInfo = { from: originalFrom, pushname: pushname };
    const prompt = `Actúa como Hugo Romero, un experto en telecomunicaciones. Responde en primera persona y dirígete a tu colega por su nombre. La conversación anterior fue: "${conversationHistory}". Ahora, tu colega '${pushname}' te pregunta: "${userMessage}"`;
    client.sendMessage(aiWhatsappNumber, prompt); 
    if (!conversationHistory) client.sendMessage(originalFrom, "🤖 Estamos revisando, un momento por favor...");
}
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
const palabrasSaludo = ["hola", "saludos", "viejo Hugo", "buen dia", "buenas", "buenas tardes", "buenas noches", "buenos dias"];
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
