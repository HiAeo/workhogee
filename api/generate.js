const fetch = require('node-fetch');

// 行业提示词库
const INDUSTRY_PROMPTS = {
  drink: '将这张饮品图片放置在ins风咖啡店场景中，暖光照明，木质桌面，背景有咖啡店氛围虚化，专业美食摄影风格，高清细节，保持饮品本身完全不变',
  food: '将这张菜品图片放置在中式餐厅暖光场景中，木质餐桌，热气腾腾的氛围，专业美食摄影风格，暖色调，高清细节，保持菜品本身完全不变',
  home: '将这张家居产品图片放置在侘寂风场景中，米白色墙面，原木边几，亚麻布料，干花装饰，自然光从侧面照入，专业产品摄影风格，保持产品本身完全不变',
  beauty: '将这张美妆产品图片放置在大理石高级美妆台场景中，柔和漫射光，背景有高级感虚化，专业美妆摄影风格，保持产品本身完全不变',
  cloth: '将这张服装产品图片放置在城市街头穿搭场景中，自然光，街拍风格，专业服装摄影，保持服装本身完全不变',
  '3c': '将这张3C产品图片放置在极简科技桌面场景中，冷色调照明，深色背景，专业产品摄影风格，保持产品本身完全不变'
};

module.exports = async (req, res) => {
  // CORS 头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { image, industry, style } = req.body || {};

    if (!image) {
      return res.status(400).json({ error: '缺少图片参数' });
    }

    const apiKey = process.env.VOLCENGINE_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: '服务器未配置API Key' });
    }

    const prompt = INDUSTRY_PROMPTS[industry] || INDUSTRY_PROMPTS.food;

    // 调用火山引擎图像生成API
    const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'doubao-seedream-4-5-251128',
        prompt: prompt,
        image: image,
        size: '1024x1024',
        response_format: 'url'
      })
    });

    const data = await response.json();

    if (data.error) {
      console.error('火山引擎API错误:', JSON.stringify(data.error));
      return res.status(500).json({ error: data.error.message || '生成失败' });
    }

    if (!data.data || !data.data[0]) {
      return res.status(500).json({ error: 'API返回格式异常' });
    }

    return res.status(200).json({
      success: true,
      url: data.data[0].url,
      industry: industry,
      prompt: prompt
    });

  } catch (error) {
    console.error('生成异常:', error);
    return res.status(500).json({ error: error.message || '服务器内部错误' });
  }
};
