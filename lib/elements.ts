const rows = `H 氢 Hydrogen
He 氦 Helium
Li 锂 Lithium
Be 铍 Beryllium
B 硼 Boron
C 碳 Carbon
N 氮 Nitrogen
O 氧 Oxygen
F 氟 Fluorine
Ne 氖 Neon
Na 钠 Sodium
Mg 镁 Magnesium
Al 铝 Aluminium
Si 硅 Silicon
P 磷 Phosphorus
S 硫 Sulfur
Cl 氯 Chlorine
Ar 氩 Argon
K 钾 Potassium
Ca 钙 Calcium
Sc 钪 Scandium
Ti 钛 Titanium
V 钒 Vanadium
Cr 铬 Chromium
Mn 锰 Manganese
Fe 铁 Iron
Co 钴 Cobalt
Ni 镍 Nickel
Cu 铜 Copper
Zn 锌 Zinc
Ga 镓 Gallium
Ge 锗 Germanium
As 砷 Arsenic
Se 硒 Selenium
Br 溴 Bromine
Kr 氪 Krypton
Rb 铷 Rubidium
Sr 锶 Strontium
Y 钇 Yttrium
Zr 锆 Zirconium
Nb 铌 Niobium
Mo 钼 Molybdenum
Tc 锝 Technetium
Ru 钌 Ruthenium
Rh 铑 Rhodium
Pd 钯 Palladium
Ag 银 Silver
Cd 镉 Cadmium
In 铟 Indium
Sn 锡 Tin
Sb 锑 Antimony
Te 碲 Tellurium
I 碘 Iodine
Xe 氙 Xenon
Cs 铯 Caesium
Ba 钡 Barium
La 镧 Lanthanum
Ce 铈 Cerium
Pr 镨 Praseodymium
Nd 钕 Neodymium
Pm 钷 Promethium
Sm 钐 Samarium
Eu 铕 Europium
Gd 钆 Gadolinium
Tb 铽 Terbium
Dy 镝 Dysprosium
Ho 钬 Holmium
Er 铒 Erbium
Tm 铥 Thulium
Yb 镱 Ytterbium
Lu 镥 Lutetium
Hf 铪 Hafnium
Ta 钽 Tantalum
W 钨 Tungsten
Re 铼 Rhenium
Os 锇 Osmium
Ir 铱 Iridium
Pt 铂 Platinum
Au 金 Gold
Hg 汞 Mercury
Tl 铊 Thallium
Pb 铅 Lead
Bi 铋 Bismuth
Po 钋 Polonium
At 砹 Astatine
Rn 氡 Radon
Fr 钫 Francium
Ra 镭 Radium
Ac 锕 Actinium
Th 钍 Thorium
Pa 镤 Protactinium
U 铀 Uranium
Np 镎 Neptunium
Pu 钚 Plutonium
Am 镅 Americium
Cm 锔 Curium
Bk 锫 Berkelium
Cf 锎 Californium
Es 锿 Einsteinium
Fm 镄 Fermium
Md 钔 Mendelevium
No 锘 Nobelium
Lr 铹 Lawrencium
Rf 𬬻 Rutherfordium
Db 𬭊 Dubnium
Sg 𬭳 Seaborgium
Bh 𬭛 Bohrium
Hs 𬭶 Hassium
Mt 鿏 Meitnerium
Ds 𫟼 Darmstadtium
Rg 𬬭 Roentgenium
Cn 鿔 Copernicium
Nh 鿭 Nihonium
Fl 𫓧 Flerovium
Mc 镆 Moscovium
Lv 𫟷 Livermorium
Ts 鿬 Tennessine
Og 鿫 Oganesson`;
export const ELEMENTS = rows.split('\n').map((line, i) => {
  const [symbol, name, english] = line.split(' '),
    number = i + 1;
  const period =
    number <= 2
      ? 1
      : number <= 10
        ? 2
        : number <= 18
          ? 3
          : number <= 36
            ? 4
            : number <= 54
              ? 5
              : number <= 86
                ? 6
                : 7;
  let group: number | null;
  if ((number >= 57 && number <= 71) || (number >= 89 && number <= 103))
    group = null;
  else if (period === 1) group = number === 1 ? 1 : 18;
  else if (period <= 3) {
    const n = number - (period === 2 ? 2 : 10);
    group = n <= 2 ? n : n + 10;
  } else {
    const start =
      period === 4 ? 18 : period === 5 ? 36 : period === 6 ? 54 : 86;
    group = number - start - (period >= 6 && number > start + 17 ? 14 : 0);
  }
  const category =
    number >= 57 && number <= 71
      ? '镧系'
      : number >= 89 && number <= 103
        ? '锕系'
        : group === 18
          ? '稀有气体'
          : group === 17
            ? '卤素'
            : group === 1 && number !== 1
              ? '碱金属'
              : group === 2
                ? '碱土金属'
                : [5, 14, 32, 33, 51, 52].includes(number)
                  ? '类金属'
                  : [1, 6, 7, 8, 15, 16, 34].includes(number)
                    ? '其他非金属'
                    : group !== null && group >= 3 && group <= 12
                      ? '过渡金属'
                      : '其他金属';
  return {
    number,
    symbol,
    name,
    english,
    period,
    group,
    category,
    row: group === null ? (period === 6 ? 9 : 10) : period,
    column: group ?? number - (period === 6 ? 57 : 89) + 3,
  };
});
