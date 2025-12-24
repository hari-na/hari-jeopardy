
import { Category } from "../types";
import medicalQuestions from "../data/medical_questions.json";

export const loadMedicalBoard = async (): Promise<Category[]> => {
    // Simulate a small delay for "loading" feel
    await new Promise(resolve => setTimeout(resolve, 500));

    return medicalQuestions.map((cat, cIdx) => ({
        title: cat.title,
        questions: cat.questions.map((q, qIdx) => ({
            ...q,
            id: `static-${cIdx}-${qIdx}`,
            isAnswered: false,
            category: cat.title
        }))
    }));
};
