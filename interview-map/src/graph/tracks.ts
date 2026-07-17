import type { Track } from '../lib/tracks'

// Hand-curated, goal-oriented courses (ordered node ids verified against graph.json).
export const CURATED_TRACKS: Track[] = [
  {
    id: 'curated:junior-backend',
    title: '신입 백엔드 필수',
    description: 'CS 기초부터 웹·DB·스프링까지 면접 필수 순서',
    icon: '🎯',
    steps: [
      'dsa-bigo', 'dsa-hash', 'jvm', 'jvm-gc', 'collections',
      'os-process', 'os-scheduling', 'concurrency',
      'net-osi', 'net-tcp', 'net-http',
      'db-index', 'db-tx', 'spring-ioc', 'spring-tx',
    ],
  },
  {
    id: 'curated:crash-7',
    title: '면접 D-7 벼락치기',
    description: '가장 자주 나오는 핵심만 빠르게',
    icon: '⚡',
    steps: [
      'jvm-gc', 'collections', 'os-process', 'concurrency',
      'net-tcp', 'net-http', 'db-index', 'db-tx', 'spring-ioc', 'spring-aop',
    ],
  },
  {
    id: 'curated:java-deep',
    title: '자바 백엔드 심화',
    description: 'JVM·스프링·DB 내부 동작 깊게',
    icon: '🧩',
    steps: [
      'jvm-memory', 'jvm-gc', 'jvm-jit', 'concurrency', 'collections',
      'spring-ioc', 'spring-bean', 'spring-aop', 'spring-proxy',
      'spring-tx', 'spring-tx-propagation',
      'db-tx', 'db-isolation', 'db-mvcc', 'db-btree',
    ],
  },
]
