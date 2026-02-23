import { GoogleGenAI } from "@google/genai";
import { StyleEntry } from "../types";

// Helper to check for API Key capability in this environment
export const checkApiKey = async (): Promise<boolean> => {
  if (typeof window !== 'undefined' && (window as any).aistudio) {
    return await (window as any).aistudio.hasSelectedApiKey();
  }
  return true; // Assume true if not in the specific aistudio environment, fallback to env var
};

export const promptForKey = async () => {
  if (typeof window !== 'undefined' && (window as any).aistudio) {
    await (window as any).aistudio.openSelectKey();
  }
};

// Summarize data to save tokens
const summarizeData = (data: StyleEntry[]): string => {
  const summary = data.map(s => ({
    line: s.physicalLine,
    style: s.styleName,
    start: s.startDate?.toLocaleDateString(),
    end: s.endDate?.toLocaleDateString(),
    target: s.totalTarget,
    mp: s.totalManpower,
    remarks: s.remarks.length > 0 ? s.remarks.join("; ") : undefined,
    issues: s.anomalies.map(a => a.message).join(", ")
  }));
  return JSON.stringify(summary, null, 2);
};

export const streamGeminiResponse = async function* (
  history: { role: string; text: string }[],
  dataContext: StyleEntry[],
  mode: 'fast' | 'deep'
) {
  // Ensure we have a key before making the call
  const hasKey = await checkApiKey();
  if (!hasKey) {
    await promptForKey();
  }

  // Use VITE_GEMINI_API_KEY from env, or fall back to user input mechanism
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || (window as any).GEMINI_API_KEY;

  if (!apiKey && !(window as any).aistudio) {
    yield "Error: No API Key found. Please set VITE_GEMINI_API_KEY in .env.local";
    return;
  }

  const ai = new GoogleGenAI({ apiKey });
  const contextStr = summarizeData(dataContext);

  const systemInstruction = `You are an expert Production Planner assistant for an apparel factory. 
  You have access to the current production schedule in JSON format.
  
  CONTEXT DATA:
  ${contextStr}
  
  Your goal is to help the user understand the schedule, identify risks, and optimize resources.
  ${mode === 'fast' ? "Keep answers concise and immediate." : "Think deeply about bottlenecks, efficiency, and resource regression."}
  `;

  try {
    if (mode === 'deep') {
      // Gemini 3 Pro with Thinking
      const response = await ai.models.generateContentStream({
        model: 'gemini-3-pro-preview',
        contents: history.map(h => ({ role: h.role === 'model' ? 'model' : 'user', parts: [{ text: h.text }] })),
        config: {
          systemInstruction: systemInstruction,
          thinkingConfig: { thinkingBudget: 32768 }, // Max thinking budget
        },
      });

      for await (const chunk of response) {
        yield chunk.text;
      }
    } else {
      // Gemini 2.5 Flash Lite for speed
      const response = await ai.models.generateContentStream({
        model: 'gemini-2.5-flash-lite-preview-02-05',
        contents: history.map(h => ({ role: h.role === 'model' ? 'model' : 'user', parts: [{ text: h.text }] })),
        config: {
          systemInstruction: systemInstruction,
        },
      });

      for await (const chunk of response) {
        yield chunk.text;
      }
    }
  } catch (error) {
    console.error("AI Error:", error);
    yield "Error: Unable to connect to AI service. Please check your API key connection.";
  }
};

export const generateDeepAnalysis = async (data: StyleEntry[]): Promise<string> => {
  const hasKey = await checkApiKey();
  if (!hasKey) {
    await promptForKey();
  }

  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || (window as any).GEMINI_API_KEY;
  const ai = new GoogleGenAI({ apiKey });
  const contextStr = summarizeData(data);

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `Perform a comprehensive risk analysis on this schedule.
    1. Identify critical bottlenecks where lines are overloaded.
    2. Flag illogical style sequences (e.g. changing from a complex jacket to a simple tee and back).
    3. Highlight supervisors with disproportionate workload.
    4. Analyze the "Remarks" fields for hidden constraints.
    
    Format the output as a clean Markdown report.`,
    config: {
      systemInstruction: "You are a Senior Factory Operations Manager. Context: " + contextStr,
      thinkingConfig: { thinkingBudget: 32768 },
    },
  });

  return response.text || "No analysis generated.";
};
