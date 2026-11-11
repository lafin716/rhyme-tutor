import { RepoError } from './db/util'

/**
 * Tracks courses whose deletion has started. Shared by LearningService and TutorOrchestrator so that work
 * started during the deletion's awaits (chat, quiz, enqueue) is refused instead of racing the delete.
 */
export class CourseDeleteGate {
  private readonly deleting = new Set<string>()

  isDeleting(courseId: string): boolean {
    return this.deleting.has(courseId)
  }

  /** Marks the course as being deleted. Must be called synchronously, before the first await of a delete. */
  begin(courseId: string): void {
    this.assertOpen(courseId)
    this.deleting.add(courseId)
  }

  end(courseId: string): void {
    this.deleting.delete(courseId)
  }

  /** Throws NOT_FOUND when the course is being deleted (the user-facing result is the same as after deletion). */
  assertOpen(courseId: string): void {
    if (this.deleting.has(courseId)) throw new RepoError('NOT_FOUND', '코스를 찾을 수 없어요.')
  }
}
