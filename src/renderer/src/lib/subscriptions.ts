import { useEffect } from 'react'
import { useAppStore } from '../store/app-store'
import { useChatStore } from '../store/chat-store'
import { useClassroomStore } from '../store/classroom-store'
import { useCourseStore } from '../store/course-store'

/**
 * Global push subscriptions. Registered once while the app is ready:
 * chat events update the chat store (upsert by id), job/course events refresh the course list and open classroom.
 */
export function useTutorSubscriptions(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return
    const offChat = window.tutor.on.chat((event) => {
      useChatStore.getState().applyEvent(event)
      if (event.type !== 'delta' && event.type !== 'started') {
        void useClassroomStore.getState().refresh()
      }
    })
    const offJobs = window.tutor.on.jobs((event) => {
      useCourseStore.getState().setJob(event.job)
      void useCourseStore.getState().loadCards()
      const classroomCourse = useClassroomStore.getState().courseId
      if (classroomCourse && event.job.courseId === classroomCourse) {
        void useClassroomStore.getState().refresh()
      }
    })
    const offCourses = window.tutor.on.courses((event) => {
      const { route, navigate } = useAppStore.getState()
      if (event.type === 'course-deleted') {
        void useCourseStore.getState().loadCards()
        if (route.name === 'classroom' && route.courseId === event.courseId) {
          navigate({ name: 'dashboard' })
          useAppStore.getState().notify('이 수업은 삭제되었어요.', 'info')
        }
        return
      }
      void useCourseStore.getState().loadCards()
      if (useClassroomStore.getState().courseId === event.courseId) {
        void useClassroomStore.getState().refresh()
      }
    })
    return () => {
      offChat()
      offJobs()
      offCourses()
    }
  }, [enabled])
}
