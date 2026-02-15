import { summarizeAndStoreTitles } from './summariation';

const dummyRecords = [
    { title: "Attention Is All You Need", category: "Transformers" },
    { title: "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding", category: "Transformers" },
    { title: "GPT-3: Language Models are Few-Shot Learners", category: "LLMs" },
    { title: "RoBERTa: A Robustly Optimized BERT Pretraining Approach", category: "Transformers" },
    { title: "YOLOv4: Optimal Speed and Accuracy of Object Detection", category: "Computer Vision" },
    { title: "ResNet: Deep Residual Learning for Image Recognition", category: "Computer Vision" },
    { title: "AlphaGo: Mastering the game of Go with deep neural networks and tree search", category: "Reinforcement Learning" },
    { title: "Transformer-XL: Attentive Language Models Beyond a Fixed-Length Context", category: "Transformers" },
    { title: "T5: Exploring the Limits of Transfer Learning with a Unified Text-to-Text Transformer", category: "Transformers" },
    { title: "EfficientNet: Rethinking Model Scaling for Convolutional Neural Networks", category: "Computer Vision" },
    { title: "DALL-E: Zero-Shot Text-to-Image Generation", category: "Generative AI" },
    { title: "CLIP: Learning Transferable Visual Models From Natural Language Supervision", category: "Multi-modal" },
    { title: "ViT: An Image is Worth 16x16 Words: Transformers for Image Recognition at Scale", category: "Transformers" },
    { title: "LoRA: Low-Rank Adaptation of Large Language Models", category: "LLMs" },
    { title: "Llama 2: Open Foundation and Fine-Tuned Chat Models", category: "LLMs" },
    { title: "Mistral 7B", category: "LLMs" },
    { title: "PaLM: Scaling Language Modeling with Pathways", category: "LLMs" },
    { title: "FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness", category: "Optimization" },
    { title: "Adam: A Method for Stochastic Optimization", category: "Optimization" },
    { title: "XGBoost: A Scalable Tree Boosting System", category: "Machine Learning" }
];

async function test() {
    try {
        console.log("Starting test...");
        const result = await summarizeAndStoreTitles(dummyRecords);
        console.log("Test Result:", JSON.stringify(result, null, 2));
    } catch (error) {
        console.error("Test failed:", error);
    }
}

test();
