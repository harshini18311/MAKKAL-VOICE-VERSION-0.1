require('dotenv').config({ path: '../.env' });
const { HfInference } = require('@huggingface/inference');

async function testSdk() {
  const token = process.env.HF_API_KEY;
  const hf = new HfInference(token);
  const models = [
    'nielsr/vit-gpt2-image-captioning',
    'microsoft/resnet-50',
    'facebook/bart-large-mnli'
  ];
  
  for (const model of models) {
    try {
      console.log(`Testing model: ${model}...`);
      let res;
      if (model.includes('captioning')) {
        res = await hf.imageToText({ model, inputs: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", 'base64') });
      } else if (model.includes('mnli')) {
        res = await hf.zeroShotClassification({ model, inputs: "test", parameters: { candidate_labels: ["a", "b"] } });
      } else {
        res = await hf.imageClassification({ model, inputs: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", 'base64') });
      }
      console.log(`SUCCESS [${model}]:`, JSON.stringify(res));
      break;
    } catch (err) {
      console.error(`FAILED [${model}]:`, err.message);
    }
  }
}

testSdk();
