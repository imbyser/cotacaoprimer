import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// 1. Inicializa o Mercado Pago
const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });

// 2. Inicializa o Firebase Admin
if (!getApps().length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  initializeApp({
    credential: cert(serviceAccount)
  });
}
const db = getFirestore();

export default async function handler(req, res) {
  // Configuração do CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // --- ROTA 1: CRIAR COBRANÇA (PIX / CARTÃO) ---
  if (req.method === 'POST' && req.query.action !== 'webhook') {
    const { nome, telefone, senha, plano, valor } = req.body;

    if (!telefone || !senha) {
      return res.status(400).json({ error: 'Dados incompletos' });
    }

    try {
      // Salva/atualiza o usuário como PENDENTE no Firestore
      const snapshot = await db.collection('assinantes').where('telefone', '==', telefone).get();
      
      if (snapshot.empty) {
        await db.collection('assinantes').add({
          nome,
          telefone,
          senha,
          plano,
          statusAssinatura: 'PENDENTE',
          criadoEm: new Date()
        });
      } else {
        const docId = snapshot.docs[0].id;
        await db.collection('assinantes').doc(docId).update({
          nome,
          senha,
          plano,
          statusAssinatura: 'PENDENTE'
        });
      }

      // Criar preferência no Mercado Pago
      const preference = new Preference(client);
      const result = await preference.create({
        body: {
          items: [
            {
              title: `Super Cotação - Plano ${plano}`,
              quantity: 1,
              unit_price: Number(valor),
              currency_id: 'BRL',
            }
          ],
          payer: {
            name: nome,
            phone: { number: telefone }
          },
          external_reference: telefone,
          notification_url: `https://${req.headers.host}/api/checkout?action=webhook`,
          back_urls: {
            success: "https://imbyser.github.io/cotacaoprimer/index.html",
            failure: "https://imbyser.github.io/cotacaoprimer/vendas.html"
          },
          auto_return: "approved"
        }
      });

      return res.status(200).json({ init_point: result.init_point });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  }

  // --- ROTA 2: WEBHOOK (NOTIFICAÇÃO DO MERCADO PAGO) ---
  if (req.method === 'POST' && req.query.action === 'webhook') {
    const { type, data } = req.body;

    if (type === 'payment' && data?.id) {
      try {
        const payment = new Payment(client);
        const paymentData = await payment.get({ id: data.id });

        if (paymentData.status === 'approved') {
          const telefoneCliente = paymentData.external_reference;

          // Atualiza para ATIVA automaticamente
          const snapshot = await db.collection('assinantes').where('telefone', '==', telefoneCliente).get();

          if (!snapshot.empty) {
            const docId = snapshot.docs[0].id;
            await db.collection('assinantes').doc(docId).update({
              statusAssinatura: 'ATIVA',
              dataPagamento: new Date()
            });
            console.log(`✅ Assinatura ativada automaticamente para: ${telefoneCliente}`);
          }
        }
      } catch (err) {
        console.error("Erro no webhook:", err);
      }
    }
    return res.status(200).send('OK');
  }

  return res.status(405).send('Método não permitido');
}
