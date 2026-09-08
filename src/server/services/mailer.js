import nodemailer from 'nodemailer';

// Email Setup
const transporter = nodemailer.createTransport({
    host: process.env.MAIL_SERVER,
    port: Number(process.env.MAIL_PORT) || 587,
    secure: Number(process.env.MAIL_PORT) === 465, 
    auth: { user: process.env.MAIL_USERNAME, pass: process.env.MAIL_PASSWORD },
});

export const sendEmail = async (to, subject, htmlContent) => {
  if (!process.env.MAIL_SERVER) return true;
  try {
      await transporter.sendMail({
          from: `"${process.env.MAIL_FROM_NAME || 'Virgula'}" <${process.env.MAIL_FROM_ADDRESS || process.env.MAIL_USERNAME}>`,
          to, subject, html: htmlContent
      });
      return true;
  } catch (error) { return false; }
};
