import type { IconType } from 'react-icons'
import { SiOpenjdk, SiJavascript, SiReact, SiSpring, SiDocker } from 'react-icons/si'
import {
  LuSettings, LuTrash2, LuFlame, LuPackage, LuBrain, LuLibrary, LuShuffle, LuWaves,
  LuRefreshCw, LuReceipt, LuDatabase, LuLock, LuMonitor, LuMemoryStick, LuLockKeyhole,
  LuArrowDownUp, LuGlobe, LuRadio, LuCpu, LuZap, LuBinary, LuBuilding2, LuScale, LuCircle,
  LuGitFork, LuCalendarClock, LuLayers, LuArrowRightLeft, LuShieldCheck, LuServer,
  LuListTree, LuKeyRound, LuTable2, LuBoxes,
  LuContainer, LuLeaf, LuScissors, LuRoute,
} from 'react-icons/lu'

const BY_ID: Record<string, IconType> = {
  java: SiOpenjdk,
  jvm: LuSettings,
  'jvm-gc': LuTrash2,
  'jvm-jit': LuFlame,
  'jvm-classloader': LuPackage,
  'jvm-memory': LuBrain,
  collections: LuLibrary,
  concurrency: LuShuffle,
  'generics-stream': LuWaves,
  javascript: SiJavascript,
  'js-eventloop': LuRefreshCw,
  react: SiReact,
  spring: SiSpring,
  'spring-ioc': LuContainer,
  'spring-bean': LuLeaf,
  'spring-aop': LuScissors,
  'spring-tx': LuReceipt,
  'spring-mvc': LuRoute,
  database: LuDatabase,
  'db-index': LuListTree,
  'db-tx': LuLock,
  'db-lock': LuKeyRound,
  'db-normalization': LuTable2,
  'db-nosql': LuBoxes,
  os: LuMonitor,
  'os-process': LuGitFork,
  'os-scheduling': LuCalendarClock,
  'os-memory': LuMemoryStick,
  'os-sync': LuLockKeyhole,
  'os-io': LuArrowDownUp,
  network: LuGlobe,
  'net-osi': LuLayers,
  'net-tcp': LuArrowRightLeft,
  'net-http': LuRadio,
  'net-https': LuShieldCheck,
  'net-dns': LuServer,
  hw: LuCpu,
  'hw-cache': LuZap,
  dsa: LuBinary,
  systemdesign: LuBuilding2,
  'sd-lb': LuScale,
  devops: SiDocker,
}

const BY_DOMAIN: Record<string, IconType> = {
  hw: LuCpu,
  os: LuMonitor,
  network: LuGlobe,
  java: SiOpenjdk,
  javascript: SiJavascript,
  dsa: LuBinary,
  spring: SiSpring,
  react: SiReact,
  database: LuDatabase,
  systemdesign: LuBuilding2,
  devops: SiDocker,
}

export function NodeIcon({ id, domain, size = 20 }: { id: string; domain: string; size?: number }) {
  const Icon = BY_ID[id] ?? BY_DOMAIN[domain] ?? LuCircle
  return <Icon size={size} aria-hidden />
}
