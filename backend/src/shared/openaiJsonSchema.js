export async function openaiJsonSchema({ openai, model, systemPrompt, userContent, schemaSpec }) {
  const response = await openai.responses.create({
    model,
    input: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    text: { format: schemaSpec },
  });

  const rawText = response.output_text;
  if (!rawText) {
    const err = new Error('openai_empty_output');
    err.code = 'openai_empty_output';
    throw err;
  }

  return JSON.parse(rawText);
}
