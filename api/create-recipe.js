import { GoogleGenerativeAI } from '@google/generative-ai';
import { kv } from '@vercel/kv';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Função auxiliar para converter a Data URL (Base64) enviada pelo frontend para o formato aceito pelo Gemini
function fileToGenerativePart(dataUrl) {
    const matches = dataUrl.match(/^data:(.+);base64,(.+)$/);
    if (!matches) {
        throw new Error('Formato de imagem inválido.');
    }
    return {
        inlineData: {
            data: matches[2],
            mimeType: matches[1]
        },
    };
}

export default async function handler(request, response) {
    try {
        if (request.method !== 'POST') {
            return response.status(405).json({ error: 'Method Not Allowed' });
        }

        const { image, restricoes, tipo_culinaria, deviceId, isPremium } = request.body;
        
        if (!image) {
            return response.status(400).json({ error: 'A imagem é obrigatória.' });
        }

        // --- SISTEMA DE VALIDAÇÃO DE COTA GRATUITA SEGURO ---
        if (!isPremium) {
            const idDispositivo = deviceId || "dispositivo-desconhecido";
            const chaveBanco = `uso:${idDispositivo}`;

            // Busca no Vercel KV a quantidade de consultas já feitas por este hardware específico
            const usoAtual = (await kv.get(chaveBanco)) || 0;

            // Se o aparelho já realizou 5 ou mais consultas, bloqueia imediatamente o acesso à IA
            if (usoAtual >= 5) {
                return response.status(403).json({ limitReached: true });
            }

            // Se o usuário ainda tem tentativas restantes, adiciona +1 ao contador do hardware no banco
            await kv.set(chaveBanco, usoAtual + 1);
        }

        // --- PROMPT PARA O CHEF COM IA (RECEITA REVERSA) ---
        let promptText = `
        Você é um chef de cozinha criativo e experiente. Sua tarefa é analisar a imagem de ingredientes fornecida e criar uma ou mais receitas deliciosas com eles.

        1.  **Identifique** os ingredientes principais visíveis na imagem.
        2.  **Crie** de 1 a 2 receitas que utilizem primariamente esses ingredientes.
        3.  **Liste** os ingredientes que você identificou na foto e usou na receita.
        4.  **Liste** outros ingredientes básicos que podem ser necessários (ex: sal, azeite, pimenta).
        5.  **Forneça** o modo de preparo em passos claros e numerados.
        6.  **Adicione** uma estimativa de tempo de preparo e nível de dificuldade.

        Leve em consideração as seguintes preferências do usuário:
        `;

        if (restricoes) {
            promptText += `- Restrições ou Preferências: ${restricoes}\n`;
        } else {
            promptText += `- Restrições ou Preferências: Nenhuma informada.\n`;
        }

        if (tipo_culinaria) {
            promptText += `- Tipo de Culinária Desejada: ${tipo_culinaria}\n`;
        } else {
            promptText += `- Tipo de Culinária Desejada: Estilo livre, seja criativo.\n`;
        }
        
        promptText += `Dica: Como estamos no Brasil, sinta-se à vontade para sugerir pratos com um toque brasileiro se os ingredientes permitirem.\n`;

        promptText += `
        Formate sua resposta final estritamente como um único objeto JSON. O objeto deve conter uma chave "receitas", que é um ARRAY de objetos. Cada objeto de receita deve ter a seguinte estrutura exata:
        {
          "receitas": [
            {
              "titulo": "Nome do Prato",
              "descricao": "Uma descrição curta e apetitosa do prato.",
              "tempo_preparo": "Aprox. 30 minutos",
              "dificuldade": "Fácil",
              "ingredientes_identificados": ["Ingrediente 1 da foto", "Ingrediente 2 da foto"],
              "ingredientes_adicionais": ["Sal a gosto", "1 colher de sopa de azeite"],
              "modo_preparo": [
                "Passo 1: Faça isso...",
                "Passo 2: Depois faça aquilo...",
                "Passo 3: Sirva quente."
              ]
            }
          ]
        }
        `;

        // Prepara o payload da imagem
        const imagePart = fileToGenerativePart(image);

        // Inicializa o modelo Gemini adequado para visão e análise de imagem
        const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash",
            generationConfig: { responseMimeType: "application/json" }
        });

        // Executa a chamada passando o prompt e a estrutura de imagem processada
        const result = await model.generateContent([promptText, imagePart]);
        const aiResponse = await result.response;
        const aiResultString = aiResponse.text();

        const parsedResult = JSON.parse(aiResultString);
        return response.status(200).json(parsedResult);

    } catch (error) {
        console.error('Erro geral na função da API:', error);
        return response.status(500).json({ error: 'Falha interna do servidor.', details: error.message });
    }
}
