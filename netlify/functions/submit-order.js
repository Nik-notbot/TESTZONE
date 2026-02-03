// Netlify Serverless Function for secure order submission
// API keys are stored in Netlify Environment Variables (not visible to users)

exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Parse request body
    const { email, productName, price } = JSON.parse(event.body);

    // Validate required fields
    if (!email || !productName || !price) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing required fields' })
      };
    }

    // Get API keys from environment variables (secure, not visible to users)
    const BASEROW_API_TOKEN = process.env.BASEROW_API_TOKEN;
    const BASEROW_TABLE_ID = process.env.BASEROW_TABLE_ID;
    const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
    const TG_CHAT_ID = process.env.TG_CHAT_ID;

    // Check if environment variables are set
    if (!BASEROW_API_TOKEN || !BASEROW_TABLE_ID) {
      console.error('Missing Baserow environment variables');
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Server configuration error' })
      };
    }

    // 1. Save to Baserow database
    const baserowResponse = await fetch(
      `https://api.baserow.io/api/database/rows/table/${BASEROW_TABLE_ID}/?user_field_names=true`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Token ${BASEROW_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          'Email client': email,
          'Product name': productName,
          'Price': price
        })
      }
    );

    if (!baserowResponse.ok) {
      const errorText = await baserowResponse.text();
      console.error('Baserow error:', errorText);
      throw new Error('Failed to save to database');
    }

    const savedOrder = await baserowResponse.json();

    // 2. Send Telegram notification (if configured)
    if (TG_BOT_TOKEN && TG_CHAT_ID) {
      const message = `🛒 *Новый заказ!*\n\n📦 Продукт: ${productName}\n💰 Цена: ${price} ₽\n📧 Email: ${email}\n🆔 ID: ${savedOrder.id}\n⏰ Время: ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}`;
      
      try {
        await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: TG_CHAT_ID,
            text: message,
            parse_mode: 'Markdown'
          })
        });
      } catch (tgError) {
        // Log but don't fail the request if Telegram fails
        console.error('Telegram notification error:', tgError);
      }
    }

    // Return success response
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: true,
        message: 'Order submitted successfully',
        orderId: savedOrder.id
      })
    };

  } catch (error) {
    console.error('Error processing order:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'Failed to process order' })
    };
  }
};
