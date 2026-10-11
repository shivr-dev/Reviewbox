import type { ReactNode } from 'react';

function Box({
  w = 40,
  d = 34,
  h = 30,
  x = 0,
  y = 0,
  top = '#f8dcaa',
  left = '#dba66d',
  right = '#edc18a',
}: {
  w?: number;
  d?: number;
  h?: number;
  x?: number;
  y?: number;
  top?: string;
  left?: string;
  right?: string;
}) {
  const p = (a: number, b: number) => `${x + a},${y + b}`;
  return (
    <g>
      <polygon
        points={[
          p(0, -h),
          p(w, w / 2 - h),
          p(w - d, (w + d) / 2 - h),
          p(-d, d / 2 - h),
        ].join(' ')}
        fill={top}
      />
      <polygon
        points={[
          p(-d, d / 2 - h),
          p(w - d, (w + d) / 2 - h),
          p(w - d, (w + d) / 2),
          p(-d, d / 2),
        ].join(' ')}
        fill={left}
      />
      <polygon
        points={[
          p(w, w / 2 - h),
          p(w - d, (w + d) / 2 - h),
          p(w - d, (w + d) / 2),
          p(w, w / 2),
        ].join(' ')}
        fill={right}
      />
    </g>
  );
}
function Spark({ x, y }: { x: number; y: number }) {
  return (
    <path
      d={`M${x} ${y - 6}l2 4 4 2-4 2-2 4-2-4-4-2 4-2Z`}
      fill="#ffe378"
      stroke="#c69b38"
      strokeWidth="1.2"
    />
  );
}
/** One ground-centred projection shared by surfaces, legs and tabletop objects. */
function furnitureProjection(width: number, depth: number) {
  return (u: number, v: number, z = 0) => ({
    x: u - v - (width - depth) / 2,
    y: (u + v) / 2 - (width + depth) / 4 - z,
  });
}
type FurniturePoint = ReturnType<typeof furnitureProjection>;
function planePoints(p: FurniturePoint, corners: [number, number, number][]) {
  return corners
    .map(([u, v, z]) => {
      const point = p(u, v, z);
      return `${point.x},${point.y}`;
    })
    .join(' ');
}
function FurnitureBlock({
  p,
  u = 0,
  v = 0,
  w,
  d,
  z = 0,
  h,
  top,
  front,
  side,
}: {
  p: FurniturePoint;
  u?: number;
  v?: number;
  w: number;
  d: number;
  z?: number;
  h: number;
  top: string;
  front: string;
  side: string;
}) {
  return (
    <g>
      <polygon
        points={planePoints(p, [
          [u, v + d, z + h],
          [u + w, v + d, z + h],
          [u + w, v + d, z],
          [u, v + d, z],
        ])}
        fill={front}
      />
      <polygon
        points={planePoints(p, [
          [u + w, v, z + h],
          [u + w, v + d, z + h],
          [u + w, v + d, z],
          [u + w, v, z],
        ])}
        fill={side}
      />
      <polygon
        points={planePoints(p, [
          [u, v, z + h],
          [u + w, v, z + h],
          [u + w, v + d, z + h],
          [u, v + d, z + h],
        ])}
        fill={top}
      />
    </g>
  );
}
function FurnitureLegs({
  p,
  w,
  d,
  height,
  inset = 5,
}: {
  p: FurniturePoint;
  w: number;
  d: number;
  height: number;
  inset?: number;
}) {
  return (
    <g>
      {[
        [inset, inset],
        [w - inset - 4, inset],
        [inset, d - inset - 4],
        [w - inset - 4, d - inset - 4],
      ].map(([u, v], index) => (
        <FurnitureBlock
          key={index}
          p={p}
          u={u}
          v={v}
          w={4}
          d={4}
          h={height}
          top="#c99c67"
          front="#a6754e"
          side="#855c40"
        />
      ))}
    </g>
  );
}
export function FurnitureArt({
  item,
  level = 1,
  active = false,
}: {
  item: string;
  level?: number;
  active?: boolean;
}) {
  let art: ReactNode;
  const accent = level === 3 ? '#a19bdd' : level === 2 ? '#74b6c0' : '#82bfd1';
  switch (item) {
    case 'furniture-sofa': {
      const p = furnitureProjection(78, 44);
      const upholstered = level === 3 ? '#a09bd0' : '#87b9c5';
      art = (
        <>
          <ellipse
            cy="5"
            rx="63"
            ry="24"
            fill="#63777a"
            opacity=".13"
            stroke="none"
          />
          <FurnitureLegs p={p} w={78} d={44} height={9} />
          <FurnitureBlock
            p={p}
            w={78}
            d={44}
            z={9}
            h={13}
            top="#bad5da"
            front={upholstered}
            side="#6a96a5"
          />
          {/* The back and far arm precede the seat; the near arm closes its edge. */}
          <FurnitureBlock
            p={p}
            w={78}
            d={8}
            z={22}
            h={34}
            top="#cce2e5"
            front={upholstered}
            side="#739ca9"
          />
          {[5, 40].map((u) => (
            <polygon
              key={u}
              points={planePoints(p, [
                [u, 8.3, 27],
                [u + 31, 8.3, 27],
                [u + 31, 8.3, 50],
                [u, 8.3, 50],
              ])}
              fill={level === 3 ? '#b9b3dd' : '#a8ced6'}
              stroke="#779faa"
              strokeWidth="1.4"
            />
          ))}
          <FurnitureBlock
            p={p}
            w={10}
            d={36}
            v={8}
            z={22}
            h={18}
            top="#d0e5e8"
            front={upholstered}
            side="#729daa"
          />
          {[11, 39].map((u) => (
            <FurnitureBlock
              key={u}
              p={p}
              u={u}
              v={9}
              w={27}
              d={33}
              z={22}
              h={6}
              top={level === 3 ? '#d8d3eb' : '#d6e8e9'}
              front="#a2c5cb"
              side="#a4c8ce"
            />
          ))}
          <polygon
            points={planePoints(p, [
              [18, 13, 29],
              [33, 13, 29],
              [33, 12, 44],
              [18, 12, 44],
            ])}
            fill="#ffe19a"
          />
          <polyline
            points={planePoints(p, [
              [20, 12.7, 31],
              [30, 12.7, 31],
              [30, 12.2, 41],
            ])}
            stroke="#e5b967"
            strokeWidth="1"
            fill="none"
          />
          {level > 1 && (
            <polygon
              points={planePoints(p, [
                [46, 13, 29],
                [60, 13, 29],
                [60, 12, 43],
                [46, 12, 43],
              ])}
              fill="#f2c0b8"
            />
          )}
          {level === 3 && (
            <>
              <polygon
                points={planePoints(p, [
                  [17, 33, 28.7],
                  [35, 33, 28.7],
                  [35, 44.2, 28.7],
                  [35, 44.2, 12],
                  [17, 44.2, 12],
                  [17, 44.2, 28.7],
                ])}
                fill="#fff0cf"
              />
              {[21, 27, 32].map((u) => (
                <polyline
                  key={u}
                  points={planePoints(p, [
                    [u, 33, 29],
                    [u, 44.5, 29],
                    [u, 44.5, 15],
                  ])}
                  stroke="#d8b77c"
                  strokeWidth="1.2"
                  fill="none"
                />
              ))}
            </>
          )}
          <FurnitureBlock
            p={p}
            u={68}
            v={8}
            w={10}
            d={36}
            z={22}
            h={18}
            top="#d0e5e8"
            front={upholstered}
            side="#7099a8"
          />
        </>
      );
      break;
    }
    case 'furniture-desk': {
      const p = furnitureProjection(82, 44);
      const lamp = p(66, 11, 55);
      art = (
        <>
          <ellipse
            cy="4"
            rx="63"
            ry="24"
            fill="#bd9573"
            opacity=".14"
            stroke="none"
          />
          <FurnitureLegs p={p} w={82} d={44} height={47} />
          <FurnitureBlock
            p={p}
            u={3}
            v={35}
            w={76}
            d={5}
            z={37}
            h={10}
            top="#d4a476"
            front="#c59566"
            side="#b5855d"
          />
          <FurnitureBlock
            p={p}
            w={82}
            d={44}
            z={47}
            h={7}
            top="#ffe7bc"
            front="#d2a06c"
            side="#be8b5a"
          />
          <polyline
            points={planePoints(p, [
              [4, 40, 52],
              [78, 40, 52],
            ])}
            stroke="#f5d29c"
            strokeWidth="1.2"
            fill="none"
          />
          {level === 3 && (
            <>
              <FurnitureBlock
                p={p}
                u={7}
                v={5}
                w={24}
                d={8}
                z={54}
                h={4}
                top="#e9c995"
                front="#cc9b68"
                side="#b78359"
              />
              {[8, 14, 20, 26].map((u, i) => (
                <FurnitureBlock
                  key={u}
                  p={p}
                  u={u}
                  v={6}
                  w={4}
                  d={5}
                  z={58}
                  h={17 + (i % 2) * 4}
                  top="#f5e8c9"
                  front={['#8bb8ae', '#edc07e', '#acacd1', '#d7a28e'][i]}
                  side="#8b9a92"
                />
              ))}
            </>
          )}
          <FurnitureBlock
            p={p}
            u={19}
            v={20}
            w={29}
            d={18}
            z={54}
            h={2}
            top="#fff9e8"
            front="#ddcdb0"
            side="#efe2c4"
          />
          <polygon
            points={planePoints(p, [
              [19, 20, 57],
              [33, 20, 59],
              [33, 38, 59],
              [19, 38, 57],
            ])}
            fill="#fffdf0"
          />
          <polygon
            points={planePoints(p, [
              [33, 20, 59],
              [48, 20, 57],
              [48, 38, 57],
              [33, 38, 59],
            ])}
            fill="#fff7df"
          />
          {[24, 29, 34].map((v) => (
            <g key={v} stroke="#b5a28a" strokeWidth=".9">
              <polyline
                points={planePoints(p, [
                  [22, v, 57.5],
                  [29, v, 58.4],
                ])}
                fill="none"
              />
              <polyline
                points={planePoints(p, [
                  [37, v, 58.5],
                  [44, v, 57.6],
                ])}
                fill="none"
              />
            </g>
          ))}
          <FurnitureBlock
            p={p}
            u={57}
            v={27}
            w={16}
            d={9}
            z={54}
            h={3}
            top="#87b5b5"
            front="#5e9699"
            side="#70a4a4"
          />
          <polyline
            points={planePoints(p, [
              [59, 29, 57.5],
              [70, 29, 57.5],
            ])}
            stroke="#d5e6d9"
            strokeWidth="1"
            fill="none"
          />
          {level > 1 && (
            <g transform={`translate(${lamp.x} ${lamp.y})`}>
              <ellipse rx="10" ry="4.5" fill="#efd18b" />
              <path
                d="M0-2v-28l-13-8"
                fill="none"
                stroke="#9f8449"
                strokeWidth="3"
              />
              <path d="m-25-36 5-15q8-4 16 4l4 15q-13 7-25-4Z" fill="#ffdf98" />
              <ellipse cx="-12.5" cy="-34" rx="12.5" ry="5" fill="#f0bf62" />
              <path d="m-17-48-3 10" stroke="#fff1bc" strokeWidth="2" />
            </g>
          )}
        </>
      );
      break;
    }
    case 'furniture-chair':
      art = (
        <>
          <path
            d="M-22 13v24m38-7v23m21-41v25"
            stroke="#987354"
            strokeWidth="5"
          />
          <Box
            w={35}
            d={35}
            h={10}
            y={-9}
            top="#e5eeef"
            left={accent}
            right="#669da8"
          />
          <path d="M-35-5v-42q0-9 9-6L7-37q8 4 8 13v34Z" fill={accent} />
          <path d="m-25-35 27 14" stroke="#e4f2f1" />
          {level > 1 && <path d="m-20-29 16 8v19l-16-8Z" fill="#ffe1a2" />}
        </>
      );
      break;
    case 'furniture-lamp':
      art = (
        <>
          <ellipse cy="25" rx="25" ry="12" fill="#9e8053" />
          <ellipse cy="21" rx="25" ry="12" fill="#f3d498" />
          {active && (
            <path
              d="m-34-57-33 66q65 39 133 0L35-56Z"
              fill="#ffdb61"
              stroke="none"
              opacity=".23"
            />
          )}
          <path d="M0 16v-91" stroke="#9c7a4b" strokeWidth="6" />
          <path d="M25-58v30" stroke="#b29363" />
          <circle cx="25" cy="-27" r="4" fill="#e7b752" />
          <path
            d="M-21-103Q0-116 21-103l14 39Q0-45-35-64Z"
            fill={active ? '#ffedb4' : '#f7e4c7'}
          />
          <ellipse cy="-104" rx="21" ry="9" fill="#fff3d7" />
          <ellipse
            cy="-65"
            rx="34"
            ry="13"
            fill={active ? '#ffcf61' : '#d9be94'}
          />
          <path d="m-11-98-8 31m28-31 9 30" stroke="#ddc291" opacity=".7" />
          {level > 1 && <Spark x={0} y={-91} />}
          {level === 3 && (
            <path
              d="M-15 8q15-12 30 0"
              fill="none"
              stroke="#f1cc78"
              strokeWidth="4"
            />
          )}
        </>
      );
      break;
    case 'furniture-turntable':
      art = (
        <>
          <path
            d="M-28 26v10m48 18v8m28-30v9"
            stroke="#895b44"
            strokeWidth="5"
          />
          <Box
            w={55}
            d={43}
            h={32}
            y={-1}
            top="#edbb88"
            left="#b57756"
            right="#d4956b"
          />
          <path d="M-43-14v-36q0-6 8-2l47 23v40Z" fill="#d39569" />
          <ellipse
            className={active ? 'home-disc spinning' : 'home-disc'}
            cx="7"
            cy="-7"
            rx="23"
            ry="11"
            fill="#373c49"
          />
          <ellipse cx="7" cy="-7" rx="8" ry="4" fill="#eabb63" />
          <circle cx="7" cy="-7" r="1.5" fill="#fff6d3" stroke="none" />
          <path
            d="m33-15-4 16-16-6"
            stroke="#e0d5be"
            strokeWidth="4"
            fill="none"
          />
          <path d="m-28 12 28 14m-27-6 27 14" stroke="#794e41" />
          <circle cx="16" cy="35" r="3" fill="#f6d08b" />
          {level > 1 && <path d="m38 28 10-5v13l-10 5Z" fill="#f7da9c" />}
          {active && (
            <g className="home-music-notes" stroke="#498b9a" fill="#498b9a">
              <path d="M57-49v-18l16-6v17" fill="none" />
              <ellipse cx="53" cy="-48" rx="5" ry="3" />
              <ellipse cx="69" cy="-55" rx="5" ry="3" />
            </g>
          )}
        </>
      );
      break;
    case 'furniture-shelf':
      art = (
        <>
          <Box
            w={72}
            d={20}
            h={114}
            x={-25}
            y={-7}
            top="#f9ddb1"
            left="#c39a73"
            right="#e2b789"
          />
          <path
            d="m-45-73 72 36m-72-2 72 36m-72-90 72 36"
            stroke="#8b644a"
            strokeWidth="5"
          />
          {[0, 1, 2, 3, 4].map((i) => (
            <path
              key={i}
              d={`m${-35 + i * 12} ${-90 + i * 6}v23l8 4v-23Z`}
              fill={['#84b9ae', '#f6cf83', '#dd9388', '#9facd8', '#88b5c8'][i]}
            />
          ))}
          {[0, 1, 2, 3].map((i) => (
            <path
              key={i}
              d={`m${-35 + i * 15} ${-54 + i * 7.5}v23l11 5v-23Z`}
              fill={['#eecb8d', '#a0c8bf', '#f7e2bc', '#d9a9b0'][i]}
            />
          ))}
          <path
            d="m-36-88v19m12-13v18m12-12v18"
            stroke="#fff3d5"
            strokeWidth="1.5"
          />
          {level > 1 && <Spark x={12} y={-76} />}
        </>
      );
      break;
    case 'furniture-plant':
      art = (
        <>
          <ellipse
            cy="24"
            rx="27"
            ry="12"
            fill="#d3cec0"
            opacity=".4"
            stroke="none"
          />
          <path d="m-22-6 5 27q17 15 34 0l5-27Z" fill="#e7a889" />
          <ellipse cy="-6" rx="22" ry="10" fill="#f4c5a7" />
          <ellipse cy="-6" rx="17" ry="7" fill="#84644d" />
          <path
            d="M0-9v-53m0 28-17-19m18 8 17-19"
            stroke="#5e8c5b"
            strokeWidth="4"
          />
          <ellipse
            cx="-17"
            cy="-48"
            rx="15"
            ry="9"
            transform="rotate(35 -17 -48)"
            fill="#90ba77"
          />
          <ellipse
            cx="16"
            cy="-56"
            rx="17"
            ry="10"
            transform="rotate(-30 16 -56)"
            fill="#74a56e"
          />
          <ellipse cx="0" cy="-71" rx="12" ry="16" fill="#a8c88d" />
          {level > 1 && (
            <>
              <circle cx="-17" cy="-59" r="8" fill="#ffe0a1" />
              <circle cx="-17" cy="-59" r="3" fill="#e1a547" />
            </>
          )}
          {level === 3 && (
            <>
              <circle cx="17" cy="-73" r="10" fill="#f3b8ad" />
              <circle cx="17" cy="-73" r="4" fill="#ffe39d" />
            </>
          )}
        </>
      );
      break;
    case 'furniture-rug':
      art = (
        <>
          <ellipse cy="13" rx="81" ry="39" fill="#e4b659" />
          <ellipse cy="9" rx="81" ry="39" fill="#ffe3a0" />
          <ellipse
            cy="9"
            rx="69"
            ry="31"
            fill="none"
            stroke="#cf9b49"
            strokeDasharray="5 4"
          />
          <ellipse cy="9" rx="20" ry="10" fill="#f5bb55" stroke="none" />
          {Array.from({ length: 8 }, (_, i) => (
            <path
              key={i}
              transform={`translate(0 9) rotate(${i * 45})`}
              d="M28 0h9"
              stroke="#efb559"
              strokeWidth="4"
            />
          ))}
          {level > 1 && (
            <path
              d="M-73 22l-10 5m-3-13-10 4M70 26l10 5m7-16 10 4"
              stroke="#ba8e48"
            />
          )}
        </>
      );
      break;
    case 'furniture-coffee': {
      const p = furnitureProjection(44, 36);
      const cup = p(14, 20, 32);
      const cake = p(33, 10, 31);
      art = (
        <>
          <ellipse
            cy="3"
            rx="42"
            ry="18"
            fill="#c4a280"
            opacity=".14"
            stroke="none"
          />
          <FurnitureLegs p={p} w={44} d={36} height={24} inset={4} />
          {level === 3 && (
            <>
              <FurnitureBlock
                p={p}
                u={6}
                v={7}
                w={31}
                d={22}
                z={10}
                h={3}
                top="#edcc9e"
                front="#c39062"
                side="#aa7c52"
              />
              <FurnitureBlock
                p={p}
                u={10}
                v={12}
                w={22}
                d={12}
                z={13}
                h={3}
                top="#aac9ba"
                front="#749c89"
                side="#8baf9e"
              />
              <polyline
                points={planePoints(p, [
                  [12, 24.2, 14.5],
                  [29, 24.2, 14.5],
                ])}
                stroke="#fff3d9"
                strokeWidth="1"
                fill="none"
              />
            </>
          )}
          <FurnitureBlock
            p={p}
            w={44}
            d={36}
            z={24}
            h={6}
            top="#ffe8c5"
            front="#d3a171"
            side="#bb8a5c"
          />
          <polyline
            points={planePoints(p, [
              [3, 33, 29],
              [41, 33, 29],
            ])}
            stroke="#f9d6a6"
            strokeWidth="1"
            fill="none"
          />
          {level > 1 && (
            <g transform={`translate(${cake.x} ${cake.y})`}>
              <ellipse rx="10" ry="4.2" fill="#f2c4b1" />
              <path
                d="m-6-2 9-3 4 4v-5l-4-4-9 3Z"
                fill="#ecc795"
                strokeWidth="1.4"
              />
              <path d="m-6-7 9-3 4 4-9 3Z" fill="#fff0c9" strokeWidth="1.3" />
              <circle cx="2" cy="-9" r="2" fill="#d98574" strokeWidth="1" />
            </g>
          )}
          <g transform={`translate(${cup.x} ${cup.y})`}>
            <ellipse cy="1" rx="13" ry="5.5" fill="#f9f0d9" strokeWidth="1.5" />
            <ellipse
              cy="0"
              rx="10"
              ry="3.4"
              fill="#e7d3b5"
              stroke="#d4b58d"
              strokeWidth="1"
            />
            <path
              d="M7-12q11-3 10 4-1 6-10 6"
              fill="none"
              stroke="#d0b893"
              strokeWidth="3"
            />
            <path
              d="M-8-14v10q1 5 8 5t8-5v-10Z"
              fill="#fffdf0"
              strokeWidth="1.6"
            />
            <ellipse
              cy="-14"
              rx="8"
              ry="3.5"
              fill="#fcf1da"
              strokeWidth="1.6"
            />
            <ellipse cy="-14" rx="6" ry="2.3" fill="#a97b56" stroke="none" />
            <path
              className={active ? 'tea-steam' : 'hidden'}
              d="M-3-20q-4-6 0-11m5 11q5-6 1-12"
              stroke="#acaa9e"
              strokeWidth="1.5"
              fill="none"
            />
          </g>
        </>
      );
      break;
    }
    case 'furniture-bed': {
      const p = furnitureProjection(82, 44);
      const cover =
        level === 3 ? '#b0a5d8' : level === 2 ? '#8ebbbc' : '#8ebccd';
      const coverEdge = level === 3 ? '#9187bd' : '#6e9cab';
      art = (
        <>
          <ellipse
            cy="5"
            rx="65"
            ry="24"
            fill="#af967d"
            opacity=".14"
            stroke="none"
          />
          <FurnitureLegs p={p} w={82} d={44} height={8} />
          {/* Headboard rises from the same end as the pillow and is behind the mattress. */}
          <FurnitureBlock
            p={p}
            w={6}
            d={44}
            z={8}
            h={53}
            top="#f9deb5"
            front="#d4a579"
            side="#e9bf95"
          />
          <polyline
            points={planePoints(p, [
              [6.2, 5, 52],
              [6.2, 39, 52],
            ])}
            stroke="#ffe5c0"
            strokeWidth="2"
            fill="none"
          />
          {level > 1 &&
            [12, 23, 34].map((v) => {
              const stud = p(6.3, v, 47);
              return (
                <circle
                  key={v}
                  cx={stud.x}
                  cy={stud.y}
                  r="1.8"
                  fill="#b38b60"
                  stroke="none"
                />
              );
            })}
          <FurnitureBlock
            p={p}
            u={3}
            w={79}
            d={44}
            z={8}
            h={14}
            top="#edcba6"
            front="#c3946f"
            side="#b58560"
          />
          <FurnitureBlock
            p={p}
            u={7}
            v={2}
            w={72}
            d={40}
            z={22}
            h={11}
            top="#fff9e9"
            front="#e6dcc6"
            side="#f1e6ce"
          />
          <polyline
            points={planePoints(p, [
              [9, 42.3, 28],
              [77, 42.3, 28],
            ])}
            stroke="#fff5df"
            strokeWidth="1.5"
            fill="none"
          />
          <FurnitureBlock
            p={p}
            u={12}
            v={7}
            w={16}
            d={29}
            z={33}
            h={5}
            top="#fffdf0"
            front="#ece3ce"
            side="#f0e7d3"
          />
          <polygon
            points={planePoints(p, [
              [14, 9, 38.2],
              [26, 9, 38.2],
              [26, 34, 38.2],
              [14, 34, 38.2],
            ])}
            fill="#fff9e7"
            stroke="#e0d3b9"
            strokeWidth=".9"
          />
          <polygon
            points={planePoints(p, [
              [32, 2, 35],
              [79, 2, 35],
              [79, 42, 35],
              [32, 42, 35],
            ])}
            fill={cover}
          />
          <polygon
            points={planePoints(p, [
              [32, 42, 35],
              [79, 42, 35],
              [79, 42, 19],
              [32, 42, 19],
            ])}
            fill={coverEdge}
          />
          <polygon
            points={planePoints(p, [
              [79, 2, 35],
              [79, 42, 35],
              [79, 42, 19],
              [79, 2, 19],
            ])}
            fill={level === 3 ? '#a296c9' : '#80abb9'}
          />
          <polygon
            points={planePoints(p, [
              [32, 2, 36],
              [39, 2, 36],
              [39, 42, 36],
              [32, 42, 36],
            ])}
            fill={level === 3 ? '#d7ceef' : '#c7e0e4'}
          />
          {[
            [52, 14],
            [65, 29],
          ].map(([u, v]) => {
            const star = p(u, v, 35.7);
            return (
              <g
                key={u}
                transform={`translate(${star.x} ${star.y}) scale(.7 .4)`}
              >
                <Spark x={0} y={0} />
              </g>
            );
          })}
          {level > 1 && (
            <polyline
              points={planePoints(p, [
                [45, 40, 35.5],
                [76, 40, 35.5],
                [76, 42.2, 35.5],
                [76, 42.2, 21],
              ])}
              fill="none"
              stroke="#e5e8d4"
              strokeDasharray="2 3"
              strokeWidth="1.1"
            />
          )}
          {level === 3 && (
            <>
              <FurnitureBlock
                p={p}
                u={11}
                v={7}
                w={9}
                d={12}
                z={38}
                h={3}
                top="#ffe6a6"
                front="#edcd85"
                side="#f5d898"
              />
              <polyline
                points={planePoints(p, [
                  [35, 44.2, 13],
                  [78, 44.2, 13],
                ])}
                stroke="#edcba3"
                strokeWidth="1.3"
                fill="none"
              />
            </>
          )}
        </>
      );
      break;
    }
    case 'furniture-art':
      art = (
        <>
          <path
            d="M0-93-26 30m26-123 25 139M3-41l40 44"
            stroke="#bc9164"
            strokeWidth="5"
          />
          <path d="m-25-87 57 28-3 72-56-28Z" fill="#ffe0ae" />
          <path d="m-18-74 42 21-3 51-41-21Z" fill="#fffdf1" />
          <ellipse cx="3" cy="-27" rx="12" ry="17" fill="#353b3d" />
          <ellipse cx="3" cy="-22" rx="7" ry="11" fill="#f9faf0" />
          <path d="m-26 2 58 29" stroke="#a37a4c" strokeWidth="5" />
          {level > 1 && <Spark x={36} y={-64} />}
        </>
      );
      break;
    case 'furniture-cat':
      art = (
        <>
          <Box
            w={29}
            d={29}
            h={12}
            y={5}
            top="#ffe6b5"
            left="#cfab71"
            right="#e9c992"
          />
          <VisitorCat miniature />
        </>
      );
      break;
    default:
      art = null;
  }
  return (
    <g
      className={`furniture-art level-${level} ${active ? 'active' : ''}`}
      stroke="#51473c"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {art}
      {level === 3 && item !== 'furniture-rug' && <Spark x={-48} y={-90} />}
    </g>
  );
}
export function FurniturePreview({
  item,
  level = 1,
}: {
  item: string;
  level?: number;
}) {
  const bounds: Record<string, string> = {
    'furniture-desk': '-88 -126 176 181',
    'furniture-sofa': '-88 -110 176 166',
    'furniture-bed': '-88 -116 176 172',
    'furniture-coffee': '-78 -107 156 157',
  };
  return (
    <svg
      viewBox={bounds[item] ?? '-100 -150 220 220'}
      className="furniture-preview"
      aria-hidden="true"
    >
      <FurnitureArt item={item} level={level} />
    </svg>
  );
}

export function VisitorCat({ miniature = false }: { miniature?: boolean }) {
  return (
    <g
      className={miniature ? 'visitor-miniature' : 'visitor-cat'}
      transform={miniature ? 'translate(0 -14) scale(.65)' : ''}
      stroke="#69513d"
      strokeWidth="2.3"
      strokeLinejoin="round"
    >
      <path
        className="cat-tail"
        d="M20 5q26 8 24-11-1-11-7-6"
        fill="none"
        stroke="#dcaa6a"
        strokeWidth="8"
      />
      <ellipse cy="0" rx="21" ry="24" fill="#e8bb7a" />
      <ellipse cy="3" rx="13" ry="17" fill="#fff1cc" stroke="none" />
      <path
        d="M-24-32-24-57-9-47q9-4 18 0l15-10v25q-1 23-24 23-23 0-24-23Z"
        fill="#edc68c"
      />
      <path d="m-19-48 8 4-8 6m37-10-8 4 8 6" fill="#e8a390" stroke="none" />
      <path d="m-14-29 7 2m14 0 7-2" />
      <path d="m-4-22 4 4 4-4Z" fill="#cd8e7e" stroke="none" />
      <path d="M0-18v5m0 0q-5 5-9 0m9 0q5 5 9 0" fill="none" />
      <path d="m-20-21-10-2m50 2 10-2" strokeWidth="1.5" />
      <path d="M-13 19h-7m33 0h7" strokeWidth="5" />
      <path
        className="cat-paw"
        d="m-17-3-12-13"
        stroke="#dcaa6a"
        strokeWidth="9"
      />
    </g>
  );
}

export { ItemArt } from './home-item-art';
