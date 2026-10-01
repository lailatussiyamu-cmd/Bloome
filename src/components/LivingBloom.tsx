import { useEffect, useId } from 'react';
import { Image, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';
import { STAGES, STAGE_COPY, type BloomStage } from '../domain/bloom';
import { useBloomMotion } from './useBloomMotion';
import type { DayMode } from '../domain/dayMode';

/**
 * Living Bloom — Bloome's emotional avatar. One component, driven only by state.
 *
 *   <LivingBloom stage="sprout" mode="standard" interactionState="idle" />
 *
 * Nothing here can shrink, wilt or reset the Bloom: modes change light and pace only.
 * Motion is skipped entirely when the OS "Reduce Motion" setting is on.
 */

export type InteractionState = 'idle' | 'careCompleted' | 'comeback' | 'resting';
export type BloomVariant = 'signature' | 'earth' | 'rose' | 'champagne';

export interface LivingBloomProps {
  stage: BloomStage;
  mode?: DayMode;
  interactionState?: InteractionState;
  /** v0.1 ships `signature` only; the others are token sets ready for later. */
  variant?: BloomVariant;
  size?: number;
  /** Icon use (navigation): no soil, no sparkles. */
  compact?: boolean;
  /** Hide from screen readers when a visible label already names the stage. */
  decorative?: boolean;
}

// ---------- Tokens ----------
const LEAF = { lf0: '#1F4632', lf1: '#86B894', lfEdge: '#CFE3D2', stem: '#5E8A6C', soil: '#0E1612', seed0: '#F2CD92', seed1: '#A7783F' };
type PetalTokens = { pb0: string; pb1: string; pf0: string; pf1: string; pf2: string; edge: string; glow: string; core: string; spark: string };
const PALETTES: Record<BloomVariant, PetalTokens & Partial<typeof LEAF>> = {
  signature: { pb0: '#7A5048', pb1: '#E3AE9C', pf0: '#C0806F', pf1: '#F1C1AE', pf2: '#FFF1EA', edge: '#FFEFE7', glow: '#FFD9C4', core: '#FFE9CC', spark: '#FCE6DC' },
  earth: { pb0: '#4E5A45', pb1: '#A9B596', pf0: '#8C9A78', pf1: '#D5DDC3', pf2: '#F5F3E6', edge: '#F8F6EA', glow: '#E6E6C4', core: '#F3EFD2', spark: '#EEF0DC' },
  rose: { pb0: '#7A3E4A', pb1: '#D98C9C', pf0: '#B85C70', pf1: '#EFA3B2', pf2: '#FCE1E6', edge: '#FFEEF1', glow: '#FFC9D2', core: '#FFE0E6', spark: '#FFE3E8' },
  champagne: { pb0: '#6E5A3C', pb1: '#D8BB8A', pf0: '#B49258', pf1: '#EBD3A2', pf2: '#FFF3DC', edge: '#FFF8EA', glow: '#FFE3AE', core: '#FFF0CC', spark: '#FFF1D2' },
};

const MODE_LOOK: Record<DayMode, { halo: number; opacity: number; breatheMs: number; amp: number; say: string }> = {
  standard: { halo: 1, opacity: 1, breatheMs: 6000, amp: 0.025, say: 'hari biasa, tenang' },
  minimum: { halo: 0.55, opacity: 0.9, breatheMs: 9000, amp: 0.012, say: 'hari minimum, lebih lembut' },
  recovery: { halo: 0.72, opacity: 0.94, breatheMs: 8000, amp: 0.015, say: 'masa pulih, hangat' },
  lifeHappens: { halo: 0.62, opacity: 0.92, breatheMs: 9000, amp: 0.012, say: 'hidup sedang ramai, sabar menunggu' },
};

const INTERACTION_SAY: Record<InteractionState, string> = {
  idle: '',
  careCompleted: ', bersinar karena momen peduli',
  comeback: ', perlahan terbangun kembali',
  resting: ', beristirahat dengan damai',
};

// ---------- Geometry (viewBox 0 0 200 200, ground at y = 172) ----------
const PETAL = 'M0 0 C 23 -20, 29 -58, 0 -100 C -13 -65, -26 -30, 0 0 Z';
const LEAF_PATH = 'M0 0 C 18 -14, 22 -40, 0 -64 C -22 -40, -18 -14, 0 0 Z';

type Part = [x: number, y: number, rot: number, sx: number, sy?: number];
interface StageShape {
  halo: [rx: number, ry: number, cy: number];
  stem?: string;
  leaves: Part[];
  back: Part[];
  front: Part[];
  core?: [cx: number, cy: number, r: number];
}

const SHAPES: Record<Exclude<BloomStage, 'seed'>, StageShape> = {
  sprout: {
    halo: [60, 52, 140],
    stem: 'M100 172 C 100 162, 101 152, 100 142',
    leaves: [[100, 145, -56, 0.46], [100, 145, 52, 0.4]],
    back: [],
    front: [],
    core: [100, 141, 5],
  },
  leaves: {
    halo: [74, 62, 134],
    stem: 'M100 172 C 100 155, 101 138, 100 122',
    leaves: [[100, 170, -66, 0.86], [100, 170, 64, 0.8], [100, 146, -38, 0.62], [100, 146, 40, 0.6], [100, 124, -4, 0.5]],
    back: [],
    front: [],
  },
  bud: {
    halo: [80, 70, 124],
    stem: 'M100 172 C 100 158, 101 142, 100 132',
    leaves: [[100, 172, -74, 0.95], [100, 172, 72, 0.9], [100, 172, -50, 0.68], [100, 172, 50, 0.66]],
    back: [[100, 134, -15, 0.5, 0.56], [100, 134, 15, 0.5, 0.56]],
    front: [[100, 134, -6, 0.52, 0.62], [100, 134, 6, 0.52, 0.62], [100, 134, 0, 0.46, 0.68]],
    core: [100, 116, 12],
  },
  bloom: {
    halo: [94, 80, 124],
    leaves: [[100, 172, -82, 1.05], [100, 172, 82, 1]],
    back: [[100, 165, -66, 0.62], [100, 165, 66, 0.62], [100, 165, -44, 0.74], [100, 165, 44, 0.74]],
    front: [[100, 165, -25, 0.8], [100, 165, 25, 0.8], [100, 165, -10, 0.86], [100, 165, 10, 0.86], [100, 165, 0, 0.9]],
    core: [100, 138, 18],
  },
  flourish: {
    halo: [102, 88, 118],
    leaves: [[100, 172, -84, 1.15], [100, 172, 84, 1.1], [100, 172, -70, 0.85], [100, 172, 70, 0.85]],
    back: [[100, 166, -80, 0.66], [100, 166, 80, 0.66], [100, 166, -60, 0.78], [100, 166, 60, 0.78]],
    front: [[100, 166, -40, 0.88], [100, 166, 40, 0.88], [100, 166, -22, 0.95], [100, 166, 22, 0.95], [100, 166, -8, 1], [100, 166, 8, 1], [100, 166, 0, 1.04]],
    core: [100, 132, 22],
  },
};

const SPARKS: [number, number, number][] = [[44, 74, 1.6], [160, 56, 1.3], [174, 112, 1.8], [28, 126, 1.3], [130, 30, 1.1]];

const tf = ([x, y, rot, sx, sy]: Part) => `translate(${x} ${y}) rotate(${rot}) scale(${sx} ${sy ?? sx})`;

export function LivingBloom({
  stage,
  mode = 'standard',
  interactionState = 'idle',
  variant = 'signature',
  size: requestedSize = 240,
  compact = false,
  decorative = false,
}: LivingBloomProps) {
  const { width } = useWindowDimensions();
  const size = Math.min(requestedSize, Math.max(48, width - 48));
  const reduceMotion = useBloomMotion();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const p = { ...LEAF, ...PALETTES[variant] };
  const look = MODE_LOOK[mode];

  let halo = look.halo;
  let breatheMs = look.breatheMs;
  let amp = look.amp;
  if (interactionState === 'resting') {
    halo *= 0.7;
    breatheMs = 12000;
    amp = 0.006;
  }
  if (interactionState === 'careCompleted') halo = Math.min(1, halo * 1.3 + 0.1);
  if (compact) halo *= 0.8;

  // ---------- Motion ----------
  const breathe = useSharedValue(1);
  const pop = useSharedValue(1);
  const wake = useSharedValue(interactionState === 'comeback' && !reduceMotion ? 0.3 : 1);
  const ring = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion || compact) {
      cancelAnimation(breathe);
      breathe.value = 1;
      return;
    }
    breathe.value = withRepeat(
      withSequence(
        withTiming(1 + amp, { duration: breatheMs / 2, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: breatheMs / 2, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
    return () => cancelAnimation(breathe);
  }, [reduceMotion, compact, amp, breatheMs, breathe]);

  useEffect(() => {
    cancelAnimation(pop);
    cancelAnimation(ring);
    cancelAnimation(wake);
    pop.value = 1;
    ring.value = 1;
    wake.value = 1;
    if (reduceMotion || compact) return;
    if (interactionState === 'careCompleted') {
      pop.value = withDelay(200, withSequence(withTiming(1.045, { duration: 480 }), withTiming(1, { duration: 800 })));
      ring.value = 0;
      ring.value = withDelay(200, withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }));
    }
    if (interactionState === 'comeback') {
      wake.value = 0.3;
      wake.value = withTiming(1, { duration: 2600, easing: Easing.out(Easing.cubic) });
    }
    return () => {
      cancelAnimation(pop);
      cancelAnimation(ring);
      cancelAnimation(wake);
    };
  }, [interactionState, reduceMotion, compact, pop, ring, wake]);

  const plantStyle = useAnimatedStyle(() => ({
    opacity: wake.value * look.opacity,
    transform: [
      { translateY: (1 - wake.value) * 10 },
      // scale around the base of the plant, not the centre
      { translateY: size * 0.36 },
      { scale: breathe.value * pop.value },
      { translateY: -size * 0.36 },
    ],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    opacity: interactionState === 'careCompleted' ? (1 - ring.value) * 0.7 : 0,
    transform: [{ scale: 0.25 + ring.value * 0.85 }],
  }));

  const atlasIndex = STAGES.indexOf(stage);
  const tileSize = size * (compact ? 1 : 0.94);
  const shape = stage === 'seed' ? null : SHAPES[stage];
  const haloDims = shape?.halo ?? [52, 44, 146];
  const late = stage === 'bloom' || stage === 'flourish';
  const label = `Bloom-mu, tahap ${STAGE_COPY[stage].name}, ${look.say}${INTERACTION_SAY[interactionState]}`;

  const defs = (id = uid) => (
    <Defs>
      <RadialGradient id={`${id}halo`} cx="50%" cy="62%" r="50%">
        <Stop offset="0" stopColor={p.glow} stopOpacity={0.78} />
        <Stop offset="0.55" stopColor={p.glow} stopOpacity={0.26} />
        <Stop offset="1" stopColor={p.glow} stopOpacity={0} />
      </RadialGradient>
      <RadialGradient id={`${id}aura`} cx="50%" cy="55%" r="50%">
        <Stop offset="0" stopColor={p.pf1} stopOpacity={0.3} />
        <Stop offset="1" stopColor={p.pf1} stopOpacity={0} />
      </RadialGradient>
      <RadialGradient id={`${id}core`} cx="50%" cy="50%" r="50%">
        <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.95} />
        <Stop offset="0.4" stopColor={p.core} stopOpacity={0.6} />
        <Stop offset="1" stopColor={p.glow} stopOpacity={0} />
      </RadialGradient>
      <RadialGradient id={`${id}seed`} cx="42%" cy="36%" r="70%">
        <Stop offset="0" stopColor={p.core} />
        <Stop offset="0.55" stopColor={p.seed0} />
        <Stop offset="1" stopColor={p.seed1} />
      </RadialGradient>
      <LinearGradient id={`${id}pf`} x1="0" y1="1" x2="0" y2="0">
        <Stop offset="0" stopColor={p.pf0} stopOpacity={0.62} />
        <Stop offset="0.6" stopColor={p.pf1} stopOpacity={0.88} />
        <Stop offset="1" stopColor={p.pf2} stopOpacity={1} />
      </LinearGradient>
      <LinearGradient id={`${id}pb`} x1="0" y1="1" x2="0" y2="0">
        <Stop offset="0" stopColor={p.pb0} stopOpacity={0.5} />
        <Stop offset="1" stopColor={p.pb1} stopOpacity={0.66} />
      </LinearGradient>
      <LinearGradient id={`${id}lf`} x1="0" y1="1" x2="0" y2="0">
        <Stop offset="0" stopColor={p.lf0} stopOpacity={0.9} />
        <Stop offset="1" stopColor={p.lf1} stopOpacity={0.82} />
      </LinearGradient>
    </Defs>
  );

  return (
    <View
      style={{ width: size, height: size }}
      accessible={!decorative}
      accessibilityRole={decorative ? undefined : 'image'}
      accessibilityLabel={decorative ? undefined : label}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'yes'}
      accessibilityElementsHidden={decorative}
    >
      {/* Light behind the plant */}
      <Svg width={size} height={size} viewBox="0 0 200 200" style={{ position: 'absolute' }}>
        {defs()}
        <Ellipse cx={100} cy={haloDims[2]} rx={haloDims[0] * 1.3} ry={haloDims[1] * 1.25} fill={`url(#${uid}aura)`} opacity={halo} />
        <Ellipse cx={100} cy={haloDims[2]} rx={haloDims[0]} ry={haloDims[1]} fill={`url(#${uid}halo)`} opacity={halo} />
        {variant !== 'signature' && !compact && <Ellipse cx={100} cy={175} rx={50} ry={7} fill={p.soil} opacity={0.85} />}
        {late && !compact && interactionState !== 'resting' &&
          SPARKS.map(([cx, cy, r]) => <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill={p.spark} opacity={0.5} />)}
      </Svg>

      {/* Care Moment ring */}
      {!compact && !reduceMotion && (
        <Animated.View
          pointerEvents="none"
          style={[{ position: 'absolute', left: 0, top: 0, width: size, height: size, alignItems: 'center', justifyContent: 'center' }, ringStyle]}
        >
          <View style={{ width: size * 0.9, height: size * 0.9, borderRadius: size, borderWidth: 1.5, borderColor: p.glow }} />
        </Animated.View>
      )}

      {/* The plant */}
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: size, height: size }, plantStyle]}>
        {variant === 'signature' ? (
          <View style={{width:size,height:size,alignItems:'center',justifyContent:'center'}}>
            <View style={{width:tileSize,height:tileSize,overflow:'hidden'}}>
              <Image source={require('../../assets/living-bloom-atlas.png')} accessible={false} fadeDuration={0} resizeMode="stretch" style={{position:'absolute',width:tileSize*3,height:tileSize*2,left:-(atlasIndex%3)*tileSize,top:-Math.floor(atlasIndex/3)*tileSize}} />
            </View>
          </View>
        ) : <Svg width={size} height={size} viewBox={compact ? (stage === 'seed' ? '64 114 72 72' : stage === 'sprout' ? '60 104 80 80' : '12 22 176 176') : '0 0 200 200'}>
          {defs(`${uid}plant`)}
          {stage === 'seed' ? (
            <G>
              <Circle cx={100} cy={150} r={30} fill={`url(#${uid}planthalo)`} opacity={0.9} />
              <Path d="M100 172 C77 161 83 144 100 124 C117 145 123 162 100 172Z" fill={`url(#${uid}plantseed)`} stroke={p.edge} strokeWidth={0.8} />
              <Ellipse cx={96} cy={145} rx={4} ry={6.5} fill="#FFF7EA" opacity={0.55} />
            </G>
          ) : (
            shape && (
              <G>
                {shape.leaves.map((l, i) => (
                  <Path key={`l${i}`} d={LEAF_PATH} transform={tf(l)} fill={`url(#${uid}plantlf)`} stroke={p.lfEdge} strokeOpacity={0.45} strokeWidth={1.5} />
                ))}
                {shape.stem && <Path d={shape.stem} fill="none" stroke={p.stem} strokeWidth={2.6} strokeLinecap="round" />}
                {shape.back.map((b, i) => (
                  <Path key={`b${i}`} d={PETAL} transform={tf(b)} fill={`url(#${uid}plantpb)`} stroke={p.edge} strokeOpacity={0.42} strokeWidth={1.5} />
                ))}
                {shape.front.map((f, i) => (
                  <G key={`f${i}`} transform={tf(f)}>
                    <Path d={PETAL} fill={`url(#${uid}plantpf)`} stroke={p.edge} strokeOpacity={0.7} strokeWidth={1.3} />
                    <Path d="M0 -2 C-4 -30 7 -62 0 -96 M0 -12 C10 -32 16 -50 4 -77" fill="none" stroke={p.edge} strokeOpacity={0.25} strokeWidth={0.7} />
                  </G>
                ))}
                {shape.core && <Circle cx={shape.core[0]} cy={shape.core[1]} r={shape.core[2]} fill={`url(#${uid}plantcore)`} opacity={0.8} />}
              </G>
            )
          )}
        </Svg>}
      </Animated.View>
    </View>
  );
}
