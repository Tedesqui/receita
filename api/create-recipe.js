import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(request, response) {
    try {
        if (request.method !== 'POST') {
            return response.status(405).json({ error: 'Method Not Allowed' });
        }

        const { image, restricoes, tipo_culinaria } = request.body;
        if (!image) {
            return response.status(400).json({ error: 'A imagem é obrigatória.' });
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
        
        // Adicionando um toque local com base no nosso contexto.
        promptText += `Dica: Como estamos no Brasil, sinta-se à vontade para sugerir pratos com um toque brasileiro se os ingredientes permitirem.\n`;

        promptText += `
        Formate sua resposta final estritamente como um único objeto JSON. O objeto deve conter uma chave "receitas", que é um ARRAY de objetos. Cada objeto de receita deve ter a seguinte estrutura:
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

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            response_format: { type: "json_object" },
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: promptText },
                        { type: "image_url", image_url: { "url": image } },
                    ],
                },
            ],
            max_tokens: 2500,
        });

        const aiResultString = completion.choices[0].message.content;
        const parsedResult = JSON.parse(aiResultString);

        return response.status(200).json(parsedResult);

    } catch (error) {
        console.error('Erro geral na função da API:', error);
        return response.status(500).json({ error: 'Falha interna do servidor.', details: error.message });
    }
}