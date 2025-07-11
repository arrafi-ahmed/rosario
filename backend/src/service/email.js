const handlebars = require("handlebars");
const fs = require("fs");
const path = require("path");
const {generateQrCode, appInfo} = require("../others/util");
const {formatTime, formatDateToMonDD} = require("../others/util");
const {createTransport} = require("nodemailer");
const registrationService = require('./registration')

const {SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, VUE_BASE_URL} =
    process.env;

const transporter = createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: true,
    auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
    },
});
const processAttachments = async (attachments = []) => {
    const result = [];

    for (const attachment of attachments) {
        if (attachment?.type === "qrcode") {
            result.push({
                filename: attachment.filename || "qrcode.png",
                content: attachment.content,
                cid: attachment.cid || "attachmentQrCode", // must match src="cid:attachmentQrCode"
                encoding: attachment.encoding || "base64",
            });
        } else if (attachment?.type === "pdf") {
            result.push({
                filename: attachment.filename || "attachment.pdf",
                content: Buffer.from(attachment.content.output(), "binary"),
            });
        } else {
            result.push(attachment); // add as-is if not QR
        }
    }
    return result;
};

exports.sendMail = async ({to, subject, html, attachments}) => {
    const mailOptions = {
        from: `${appInfo.name} <${SMTP_USER}>`,
        to,
        // bcc: '',
        subject,
        html,
        attachments: attachments?.length
            ? await processAttachments(attachments)
            : [],
    };
    return transporter.sendMail(mailOptions);
};

const emailTemplatePath = path.join(__dirname, "..", "templates", "eventTicketEmail.html");
const emailTemplateSource = fs.readFileSync(emailTemplatePath, "utf8");
const compileTicketTemplate = handlebars.compile(emailTemplateSource);

exports.sendTicket = async ({registrationId}) => {
    const {registration, event, extrasPurchase} = await registrationService.getRegistrationWEventWExtrasPurchase({
        registrationId,
    });

    const attachments = [];
    const qrCodeMain = await generateQrCode({
        id: registration.id,
        qrUuid: registration.qrUuid,
    });
    attachments.push({
        type: "qrcode",
        content: qrCodeMain, // just the base64
        cid: "qrCodeMain", // must match img src
    });

    let qrCodeExtras = null;
    if (extrasPurchase?.id && extrasPurchase.extrasData?.length) {
        qrCodeExtras = await generateQrCode({
            id: extrasPurchase.id,
            qrUuid: extrasPurchase.qrUuid,
        });
        attachments.push({
            type: "qrcode",
            content: qrCodeExtras, // just the base64
            cid: "qrCodeExtras", // must match img src
        });
    }

    const html = compileTicketTemplate({
        eventName: event.name,
        name: registration.registrationData.name,
        email: registration.registrationData.email,
        phone: registration.registrationData.phone,
        location: event.location,
        registrationTime: formatTime(registration.registrationTime),
        eventStart: formatDateToMonDD(event.startDate),
        eventEnd: formatDateToMonDD(event.endDate),
        extrasList: extrasPurchase?.extrasData || [],
        appName: appInfo.name,
    });

    return exports.sendMail({
        to: registration.registrationData.email,
        subject: `🎟️ Ticket for ${event.name}`,
        html,
        attachments
    });
};
