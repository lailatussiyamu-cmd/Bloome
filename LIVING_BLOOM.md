> Pembaruan desain terbaru: lihat DESIGN_UPDATE.md. Tema signature kini memakai aset botani RGBA; SVG tetap tersedia sebagai dasar varian.

# Living Bloom — v0.1 implementation

Your Bloom grows as you care for yourself.

## Component contract

```tsx
<LivingBloom stage="sprout" mode="standard" interactionState="idle" />
```

- Stages: `seed`, `sprout`, `leaves`, `bud`, `bloom`, `flourish`.
- Day modes: `standard`, `minimum`, `recovery`, `lifeHappens`.
- Interactions: `idle`, `careCompleted`, `comeback`, `resting`.
- Optional `size`, `compact`, `decorative`, and `variant` props.
- `signature` is the default everywhere. Earth, Rose, and Champagne palette tokens are prepared; there is no theme picker, persistence, or personalization engine.

## Product behavior

The existing cumulative care-day model is retained: the first completed care moment on a local calendar day advances the internal care history. Additional moments receive acknowledgement without encouraging users to farm growth. Missing days never subtract history. Weight and day mode never enter the growth calculation. Internal counts are excluded from the public Bloom model and database view.

Minimum, recovery, and life-happens modes change light and breathing pace, never stage or geometry. Comeback gently fades into full light. Resting preserves the plant and slows its breath; no action is required. Completion produces a brief light ring and gentle pulse. Milestones show stage names, never points or a wellness score.

## Integration

| Surface | Behavior |
| --- | --- |
| Welcome / onboarding | Seed and care-first introduction, repeated at final introduction |
| Today | Persisted stage, selected day mode, resting at night or during paused nudges |
| Central navigation | Compact current-stage Bloom linking to Journey; still to reduce visual noise |
| Care completion | Current stage and mode, subtle completion response |
| Journey | All six stages, achieved dates and current-stage label; no numerical growth meter |
| Comeback | Same preserved stage, gentle reawakening |
| Minimum Day | Uses actual stored stage while previewing the softer light |
| Milestone | Current stage and completion response |

## Visual system and accessibility

The SVG uses organic translucent petals, fine veins, forest leaves, warm ivory, muted rose, and champagne light. Geometry is shared across every screen. Unique gradient IDs prevent instances interfering on web. Compact framing keeps early stages recognizable in navigation.

Motion starts disabled until the OS preference is known, responds to Reduce Motion changes, and stops in the background. Compact instances are static. Animation cleanup cancels delayed effects and restores the plant when interactions change. Stage and mood have screen-reader descriptions; navigation supplies a single named control. The app's existing Indonesian language is preserved.

## Verification

Run `npm ci`, `npm test`, `npm run typecheck`, and `npx expo lint` with Node.js 22.13 or later. A device check is still recommended for iOS/Android screen readers, font scaling, live Reduce Motion changes, and native SVG rendering.

### Verified in this delivery

- 34 domain/database tests passed (`npm test -- --pool=threads`; threads avoid this Windows sandbox's child-process restriction).
- TypeScript passed.
- ESLint passed. Expo's React lint plugin requires ESLint 9 in this dependency set; the compatible version is pinned in package.json/lockfile.
- Expo web production export passed.
- Local browser walkthrough: welcome → onboarding → Minimum Day with actual Seed → Today → care completion with Sprout → milestone → Journey → Today. Stage survived reload. A phone-sized preview is included alongside the ZIP.
- Native iOS/Android rendering, screen readers, and OS Reduce Motion toggles still require device validation.
