import { groupIdResponseSchema, inviteResponseSchema, ownLessonId } from '@lamp/domain';
import type { TestApp } from './app.js';
import type { Client } from './http.js';
import {
  type Account,
  bodyOf,
  lessonRow,
  NOW,
  pushOk,
  type Row,
  sectionRow,
  signUp,
  synced,
  upsert,
} from './sync.js';

/** Ann's series John with one lesson, a group around it, and Ben, who joined. */
export async function twoInAGroup(t: TestApp, client: Client) {
  const ann = await signUp(t, client);
  const series = { ...synced(), title: 'John', description: '', kind: 'book_study' };
  const lesson = lessonRow({ title: 'The Good Shepherd', seriesId: series.id });
  await pushOk(client, ann, [upsert('series', series), upsert('lesson', lesson)]);
  const created = await client
    .post(
      '/api/groups',
      { name: 'Thursday group', seriesId: series.id, displayName: 'Ann' },
      ann.token,
    )
    .expect(201);
  const groupId = groupIdResponseSchema.parse(created.body).groupId;
  const invite = inviteResponseSchema.parse(
    (await client.get(`/api/groups/${groupId}/invite`, ann.token).expect(200)).body,
  ).url;
  const ben = await signUp(t, client);
  await client
    .post(
      '/api/invites/join',
      { token: new URL(invite).searchParams.get('token'), displayName: 'Ben' },
      ben.token,
    )
    .expect(200);
  return { ann, ben, groupId, series, lesson };
}

/** A member's own lesson for a group lesson (decision 99): its id derived from the pair. */
export async function ownLesson(account: Account, groupLesson: Row): Promise<Row> {
  return lessonRow({
    id: await ownLessonId(account.id, groupLesson.id),
    title: groupLesson.title,
    groupLessonId: groupLesson.id,
  });
}

/** A section in the group thread. */
export const shared = (lessonId: string, groupId: string, text: string, fields: object = {}) =>
  sectionRow(lessonId, {
    body: bodyOf(text),
    visibility: 'group',
    groupId,
    sharedAt: NOW,
    ...fields,
  });
