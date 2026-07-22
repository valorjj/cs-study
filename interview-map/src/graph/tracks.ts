import type { Track } from '../lib/tracks'

// Hand-curated, goal-oriented courses (ordered node ids verified against graph.json).
export const CURATED_TRACKS: Track[] = [
  {
    id: 'curated:junior-backend',
    title: '신입 백엔드 필수',
    description: 'CS 기초부터 웹·DB·스프링·보안까지 면접 필수 순서',
    icon: 'target',
    steps: [
      'dsa-bigo', 'dsa-hash', 'jvm', 'jvm-gc', 'collections',
      'os-process', 'os-scheduling', 'concurrency',
      'net-osi', 'net-tcp', 'net-http',
      'db-index', 'db-tx',
      'design-solid', 'spring-ioc', 'spring-tx', 'spring-jpa',
      'spring-security', 'sec-jwt',
    ],
  },
  {
    id: 'curated:crash-7',
    title: '면접 D-7 벼락치기',
    description: '가장 자주 나오는 핵심만 빠르게',
    icon: 'zap',
    steps: [
      'jvm-gc', 'collections', 'os-process', 'concurrency',
      'net-tcp', 'net-http', 'db-index', 'db-tx',
      'spring-ioc', 'spring-aop', 'spring-jpa', 'sec-jwt',
    ],
  },
  {
    id: 'curated:java-deep',
    title: '자바 백엔드 심화',
    description: 'JVM·스프링·JPA·DB 내부 동작 깊게',
    icon: 'puzzle',
    steps: [
      'jvm-memory', 'jvm-gc', 'jvm-jit', 'concurrency', 'collections',
      'spring-ioc', 'spring-bean', 'spring-aop', 'spring-proxy',
      'spring-tx', 'spring-tx-propagation', 'spring-jpa',
      'db-tx', 'db-isolation', 'db-mvcc', 'db-btree',
    ],
  },
  {
    id: 'curated:security-auth',
    title: '보안·인증 완성',
    description: 'JWT·OAuth2·CORS·웹 공격 방어까지 인증/인가 전 범위',
    icon: 'shield',
    steps: [
      'sec-jwt', 'sec-authz', 'spring-security',
      'sec-cors', 'sec-attacks', 'net-https',
    ],
  },
  {
    id: 'curated:msa-distributed',
    title: 'MSA·분산 시스템',
    description: '확장·캐시·CAP부터 Saga·장애격리·K8s 아키텍처까지',
    icon: 'network',
    steps: [
      'sd-lb', 'sd-cache', 'sd-dbscale', 'sd-mq', 'sd-cap',
      'sd-distributed-tx', 'sd-resilience', 'sd-msa', 'devops-k8s-arch',
    ],
  },
]
