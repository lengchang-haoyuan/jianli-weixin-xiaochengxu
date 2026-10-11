import { QUESTIONNAIRE_ITEMS } from "../../data/questionnaire";
import { getErrorMessage, saveQuestionnaire } from "../../services/cloud-api";
import type { QuestionnaireAnswer } from "../../types/domain";

interface QuestionView {
  answer: QuestionnaireAnswer | "";
  id: string;
  indexLabel: string;
  text: string;
}

interface QuestionnaireData {
  answeredCount: number;
  errorMessage: string;
  questions: QuestionView[];
  saving: boolean;
}

interface QuestionnaireMethods {
  chooseAnswer(event: TapEvent<{ answer: unknown; id: unknown }>): void;
  continueToAnalysis(skipped: boolean): Promise<void>;
  skipQuestionnaire(): Promise<void>;
  submitQuestionnaire(): Promise<void>;
}

const isAnswer = (value: unknown): value is QuestionnaireAnswer =>
  value === "yes" || value === "no" || value === "unknown";

Page<QuestionnaireData, QuestionnaireMethods>({
  data: {
    answeredCount: 0,
    errorMessage: "",
    questions: QUESTIONNAIRE_ITEMS.map((question, index) => ({
      ...question,
      answer: "",
      indexLabel: String(index + 1).padStart(2, "0"),
    })),
    saving: false,
  },

  chooseAnswer(event) {
    const id = event.currentTarget.dataset.id;
    const answer = event.currentTarget.dataset.answer;
    if (typeof id !== "string" || !isAnswer(answer) || this.data.saving) {
      return;
    }
    const questions = this.data.questions.map((question) =>
      question.id === id ? { ...question, answer } : question,
    );
    this.setData({
      answeredCount: questions.filter((question) => question.answer !== "").length,
      errorMessage: "",
      questions,
    });
  },

  async continueToAnalysis(skipped) {
    if (this.data.saving) {
      return;
    }
    if (!skipped && this.data.answeredCount !== this.data.questions.length) {
      this.setData({ errorMessage: "请完成全部 12 道题，或选择跳过问卷。" });
      return;
    }
    const answers: Record<string, QuestionnaireAnswer> = {};
    if (!skipped) {
      for (const question of this.data.questions) {
        if (isAnswer(question.answer)) {
          answers[question.id] = question.answer;
        }
      }
    }
    this.setData({ saving: true, errorMessage: "" });
    try {
      await saveQuestionnaire(answers, skipped);
      wx.redirectTo({ url: "/pages/progress/index?stage=analysis" });
    } catch (error: unknown) {
      this.setData({ saving: false, errorMessage: getErrorMessage(error) });
    }
  },

  async submitQuestionnaire() {
    await this.continueToAnalysis(false);
  },

  async skipQuestionnaire() {
    await this.continueToAnalysis(true);
  },
});
