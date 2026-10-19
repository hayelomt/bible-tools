import { type HandoutSnapshot, type Passage } from '@lamp/domain';
import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../auth/auth.decorators.js';
import type { ShareLink as StoredLink } from '../generated/prisma/client.js';
import type { ChipHref } from './render/body.js';
import type { Page } from './render/page.js';
import {
  commentaryPage,
  commentaryRefs,
  handoutPage,
  lessonPage,
  lessonRefs,
  notFoundPage,
  sectionAnchor,
  seriesPage,
} from './render/pages.js';
// Value imports, not `import type`: Nest resolves the constructor parameters from their classes.
import { BibleTextService } from './bible-text.service.js';
import { ShareLinksService } from './share-links.service.js';
import { isShareToken } from './share-token.js';
import { SharedRowsService } from './shared-rows.service.js';
import type { CommentaryView, LessonView } from './views.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * The shared pages (F34, M13-02, §17.10) at `/s/<token>`, outside the `/api` prefix, so the
 * session cookie (`Path=/api`) never comes with them and none is set. Read-only HTML, rendered
 * from the link owner's rows; a revoked, expired or mistyped link, or one whose target is gone,
 * is the same `404` page. Rate limited per IP; never indexed, cached or framed.
 */
@Public()
@Controller('s')
@UseGuards(ThrottlerGuard)
@SkipThrottle({ email: true })
@Throttle({ ip: { limit: 60, ttl: 60 * 1000 } })
export class SharedPagesController {
  constructor(
    private readonly links: ShareLinksService,
    private readonly rows: SharedRowsService,
    private readonly bible: BibleTextService,
  ) {}

  @Get(':token')
  async open(@Param('token') token: string, @Res() res: Response): Promise<void> {
    const link = isShareToken(token) ? await this.links.open(token) : null;
    send(res, link ? await this.target(link, token) : null);
  }

  /** A lesson of a shared series, under the series' link. */
  @Get(':token/lessons/:lessonId')
  async seriesLesson(
    @Param('token') token: string,
    @Param('lessonId') lessonId: string,
    @Res() res: Response,
  ): Promise<void> {
    const link = isShareToken(token) && UUID.test(lessonId) ? await this.links.open(token) : null;
    if (link?.targetType !== 'series') return send(res, null);
    const series = await this.rows.seriesView(link.userId, link.targetId!);
    const lesson = series?.lessons.find((l) => l.id === lessonId);
    if (!series || !lesson) return send(res, null);
    const base = `/s/${token}`;
    const view = await this.rows.lessonView(link.userId, lesson);
    send(
      res,
      lessonPage(
        view,
        await this.seriesHref(
          link.userId,
          base,
          series.lessons.map((l) => l.id),
        ),
        await this.lessonVerses(link.userId, view),
        { href: base, label: series.series.title },
      ),
    );
  }

  /** A reader of a lesson's chips, in the owner's translation (decision 97). */
  private async lessonVerses(userId: string, view: LessonView) {
    return this.bible.reader(await this.rows.translation(userId), lessonRefs(view));
  }

  private async target(link: StoredLink, token: string): Promise<Page | null> {
    const base = `/s/${token}`;
    switch (link.targetType) {
      case 'lesson': {
        const lesson = await this.rows.lesson(link.userId, link.targetId!);
        if (!lesson) return null;
        const view = await this.rows.lessonView(link.userId, lesson);
        const own = new Set(view.rows.map((r) => r.section.id));
        const href: ChipHref = ({ targetType, targetId }) =>
          targetType === 'lesson'
            ? targetId === lesson.id
              ? base
              : null
            : own.has(targetId)
              ? `#${sectionAnchor(targetId)}`
              : null;
        return lessonPage(view, href, await this.lessonVerses(link.userId, view));
      }
      case 'series': {
        const view = await this.rows.seriesView(link.userId, link.targetId!);
        if (!view) return null;
        const translation = await this.rows.translation(link.userId);
        return seriesPage(view, (id) => `${base}/lessons/${id}`, translation);
      }
      case 'compile': {
        const view = link.live
          ? await this.rows.commentary(link.userId, link.passage as unknown as Passage)
          : (link.snapshot as unknown as CommentaryView);
        // A frozen view quotes the translation it was made in.
        const translation = view.translation ?? (await this.rows.translation(link.userId));
        const verses = await this.bible.reader(translation, commentaryRefs(view));
        const asOf = link.live ? null : link.createdAt.toISOString().slice(0, 10);
        return commentaryPage(view, asOf, verses);
      }
      case 'handout': {
        // Frozen, but it goes when its lesson does.
        const lesson = await this.rows.lesson(link.userId, link.targetId!);
        return lesson && handoutPage(link.snapshot as unknown as HandoutSnapshot);
      }
      default:
        return null;
    }
  }

  /** Link chips in a series' lessons: to its lessons and their sections, under the same link. */
  private async seriesHref(userId: string, base: string, lessonIds: string[]): Promise<ChipHref> {
    const lessons = new Set(lessonIds);
    const sections = new Map(
      (await this.rows.sectionLessons(userId, lessonIds)).map((s) => [s.id, s.lessonId]),
    );
    return ({ targetType, targetId }) => {
      if (targetType === 'lesson')
        return lessons.has(targetId) ? `${base}/lessons/${targetId}` : null;
      const lessonId = sections.get(targetId);
      return lessonId ? `${base}/lessons/${lessonId}#${sectionAnchor(targetId)}` : null;
    };
  }
}

/** Sends a page, or the not-found page with `404`, with the headers every shared page has. */
function send(res: Response, page: Page | null): void {
  const { html, csp } = page ?? notFoundPage();
  res
    .status(page ? 200 : 404)
    .set({
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': csp,
      'X-Robots-Tag': 'noindex, nofollow',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    })
    .send(html);
}
