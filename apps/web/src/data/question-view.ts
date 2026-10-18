import {
  type Question,
  type QuestionEntry,
  questionStatus,
  type QuestionStatus,
  type Section,
  type SectionBody,
  threadOf,
  toPlainText,
} from '@lamp/domain';

/**
 * A question's status from its entries (F24, §17.5), pure: the screens read the rows with Dexie
 * (`question-status.ts`), and the service worker reads them with IndexedDB itself.
 */

/**
 * Whether an answer section has an answer: text beyond the heading it was given, the question
 * (F5: "answered when the section has a body").
 */
export function hasAnswer(body: SectionBody): boolean {
  const [first, ...rest] = body.content;
  const answer = first?.type === 'heading' ? rest : body.content;
  return toPlainText({ type: 'doc', content: answer }).trim().length > 0;
}

/** A question with what its entries give it (F24, §17.5). */
export interface QuestionView extends Question {
  status: QuestionStatus;
  /** The section of its latest answer, while that section is there: "Go to answer". */
  answerSectionId: string | null;
  /** Its thread, oldest first. */
  entries: QuestionEntry[];
}

/** The rows a question's status is worked out from. */
export interface StatusRows {
  entries: readonly QuestionEntry[];
  /** The live sections the entries name, at least those of `answered` entries. */
  sections: ReadonlyMap<string, Pick<Section, 'body'>>;
}

/**
 * A question's status and answer from its entries: pure, so the service worker counts the same
 * way from the rows it reads without Dexie.
 */
export function viewOf(question: Question, { entries, sections }: StatusRows): QuestionView {
  const thread = threadOf(entries.filter((entry) => entry.questionId === question.id));
  const status = questionStatus(thread, (id) => {
    const section = sections.get(id);
    return !!section && hasAnswer(section.body);
  });
  const answered = thread.findLast((entry) => entry.kind === 'answered' && entry.sectionId);
  const answerSectionId =
    answered?.sectionId && sections.has(answered.sectionId) ? answered.sectionId : null;
  return { ...question, status, answerSectionId, entries: thread };
}
