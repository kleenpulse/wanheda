/*
 * The voice files the desktop's native Piper accepts (SPEC V46, V73): the
 * same pinned catalog as the web (lib/speech/voices.ts; a test keeps the two
 * equal), by id, with each file's size and sha256. A voice the page hands
 * over is kept only if both files match.
 */

export type VoiceDigest = { size: number; sha256: string };

export const VOICE_FILES: Readonly<Record<string, { model: VoiceDigest; config: VoiceDigest }>> = {
  "en_US-lessac-medium": { model: { size: 63_201_294, sha256: "5efe09e69902187827af646e1a6e9d269dee769f9877d17b16b1b46eeaaf019f" }, config: { size: 4_885, sha256: "efe19c417bed055f2d69908248c6ba650fa135bc868b0e6abb3da181dab690a0" } },
  "en_US-lessac-high": { model: { size: 113_895_201, sha256: "4cabf7c3a638017137f34a1516522032d4fe3f38228a843cc9b764ddcbcd9e09" }, config: { size: 4_883, sha256: "db42b97d9859f257bc1561b8ed980e7fb2398402050a74ddd6cbec931a92412f" } },
  "en_US-amy-medium": { model: { size: 63_201_294, sha256: "b3a6e47b57b8c7fbe6a0ce2518161a50f59a9cdd8a50835c02cb02bdd6206c18" }, config: { size: 4_882, sha256: "95a23eb4d42909d38df73bb9ac7f45f597dbfcde2d1bf9526fdeaf5466977d77" } },
  "en_US-ljspeech-medium": { model: { size: 63_531_379, sha256: "6f52a751e2349abe7a76735eb09dc1875298c77ea2342ffd2fef79ff81b87f22" }, config: { size: 4_972, sha256: "141d612cc0a95ed7efc1ca936b845c2364967f2e9217c5dbfcf69fc4d6c65860" } },
  "en_US-ljspeech-high": { model: { size: 114_199_011, sha256: "5d4f08ba6a2a48c44592eed3ce56bf85e9de3dd4e20df90541ae68a8310c029a" }, config: { size: 4_970, sha256: "7e1f4634af596d83cca997fb7a931ba80b70f8a316a2655ee69c55365e0ace14" } },
  "en_US-kristin-medium": { model: { size: 63_531_379, sha256: "5849957f929cbf720c258f8458692d6103fff2f0e3d3b19c8259474bb06a18d4" }, config: { size: 4_968, sha256: "5681426d4aead22195de70531eeeeddb46493cfaffc5764b2ea3db73428b651c" } },
  "en_US-norman-medium": { model: { size: 63_531_379, sha256: "b9739443232a80a59c7d18810dd856899bf16a7964725f5ab81ea49b1351cb71" }, config: { size: 4_968, sha256: "6c2db7f558a4a8deb9fe822583c1c5105f6c4e834dd0f9de8ad17a888ee9fe1d" } },
  "en_US-joe-medium": { model: { size: 63_201_294, sha256: "58afce0321b8d9c46d7cdf9c16500cc55a793b4220212dba6b70fb788b3baf06" }, config: { size: 4_794, sha256: "3d6d5410b3795cb1950595247ef8f06190719e6fdbfa3a2356d8ec368e1aad33" } },
  "en_US-kathleen-low": { model: { size: 63_104_526, sha256: "87adf17f5326bc0782282147a8b9788406236245f0f9b0e68dacb651bc1de8b6" }, config: { size: 4_169, sha256: "39ebab88416edce0f63781754651788620cb97b9bb73ddf3c01f28e29a648feb" } },
  "en_US-ryan-medium": { model: { size: 63_201_294, sha256: "abf4c274862564ed647ba0d2c47f8ee7c9b717d27bdad9219100eb310db4047a" }, config: { size: 4_883, sha256: "44034c056cb15681b2ad494307c7f3f2e4499d1253c700c711fa0a4607ffe78d" } },
  "en_GB-alba-medium": { model: { size: 63_201_294, sha256: "401369c4a81d09fdd86c32c5c864440811dbdcc66466cde2d64f7133a66ad03b" }, config: { size: 4_888, sha256: "aa965a2f02ecced632c2694e1fc72bbff6d65f265fab567ca945918c73dd89f4" } },
  "en_GB-cori-medium": { model: { size: 63_531_379, sha256: "1899f98e5fb8310154f3c2973f4b8a929ba7245e722b3d3a85680b833d95f10d" }, config: { size: 4_966, sha256: "e262c16d7f192f69d4edd6b4ef8a5915379e67495fcc402f1ab15eeb33da3d36" } },
  "en_GB-cori-high": { model: { size: 114_219_352, sha256: "470b4dd634c98f8a4850d7626ffc3dfc90774628eeef6605a6dd8f88f30a5903" }, config: { size: 4_963, sha256: "9e7fb5b5671612c22f3c81cbe46c1ae87b031a4632bcb509e499dad6f1e2adec" } },
  "en_GB-northern_english_male-medium": { model: { size: 63_201_294, sha256: "57a219ae8e638873db7d18893304be5069c42868f392bb95c3ff17f0690d0689" }, config: { size: 4_847, sha256: "69557ed3d974463453e9b0c09dd99a7ed0e52b8b87b64b357dbeeb2540a97d47" } },
  "en_GB-southern_english_female-low": { model: { size: 63_104_526, sha256: "f2f37aed1b3a093476f719d1379ba0c0b1b1cf6f1ef99288e2ebf502971a07c3" }, config: { size: 4_189, sha256: "a1af43310f8756161506e849a2863d342a98b0853af9e2437581d39e9922d0e5" } },
};
