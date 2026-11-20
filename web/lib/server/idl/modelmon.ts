/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/modelmon.json`.
 */
export type Modelmon = {
  "address": "A5svMNEtWG8ac42GccBp1FXR4GkwoqfGqh2QWGYw3nhj",
  "metadata": {
    "name": "modelmon",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Modelmon: sealed Gyms for RL, settled on Solana"
  },
  "instructions": [
    {
      "name": "activateCodeHash",
      "docs": [
        "Anyone can activate a proposed hash once its timelock has passed."
      ],
      "discriminator": [
        38,
        57,
        140,
        121,
        237,
        89,
        127,
        152
      ],
      "accounts": [
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "createGym",
      "docs": [
        "Lists a Gym. The verified grader co-signs: it holds the sealed bundle",
        "and vouches for `grader_version`, the hash of the Gym's secret grader."
      ],
      "discriminator": [
        128,
        9,
        181,
        248,
        160,
        33,
        201,
        51
      ],
      "accounts": [
        {
          "name": "leader",
          "writable": true,
          "signer": true
        },
        {
          "name": "grader",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "graderRecord",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  114,
                  97,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "grader"
              }
            ]
          }
        },
        {
          "name": "gym",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  121,
                  109
                ]
              },
              {
                "kind": "arg",
                "path": "gymId"
              }
            ]
          }
        },
        {
          "name": "leaderToken"
        },
        {
          "name": "contributorToken"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "gymId",
          "type": "string"
        },
        {
          "name": "pricePerRep",
          "type": "u64"
        },
        {
          "name": "leaderBps",
          "type": "u16"
        },
        {
          "name": "contributorBps",
          "type": "u16"
        },
        {
          "name": "platformBps",
          "type": "u16"
        },
        {
          "name": "graderVersion",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "trainTasks",
          "type": "u16"
        },
        {
          "name": "heldoutTasks",
          "type": "u16"
        }
      ]
    },
    {
      "name": "grantExclusive",
      "docs": [
        "Gives one trainer exclusive access until `until`. Escrowed purchase is out of scope here."
      ],
      "discriminator": [
        18,
        200,
        28,
        137,
        121,
        95,
        121,
        91
      ],
      "accounts": [
        {
          "name": "leader",
          "signer": true,
          "relations": [
            "gym"
          ]
        },
        {
          "name": "gym",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "holder",
          "type": "pubkey"
        },
        {
          "name": "until",
          "type": "i64"
        }
      ]
    },
    {
      "name": "initialize",
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "treasury"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "attestationAuthority",
          "type": "pubkey"
        },
        {
          "name": "timelockSecs",
          "type": "i64"
        },
        {
          "name": "allowUnattested",
          "type": "bool"
        }
      ]
    },
    {
      "name": "openChannel",
      "docs": [
        "The trainer's one deposit. It is also the hard budget cap for the run."
      ],
      "discriminator": [
        91,
        45,
        253,
        71,
        140,
        166,
        107,
        109
      ],
      "accounts": [
        {
          "name": "trainer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "gym"
        },
        {
          "name": "mint"
        },
        {
          "name": "trainerToken",
          "writable": true
        },
        {
          "name": "channel",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  97,
                  110,
                  110,
                  101,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "gym"
              },
              {
                "kind": "account",
                "path": "trainer"
              },
              {
                "kind": "arg",
                "path": "nonce"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "channel"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "nonce",
          "type": "u64"
        },
        {
          "name": "deposit",
          "type": "u64"
        },
        {
          "name": "timeoutSecs",
          "type": "i64"
        }
      ]
    },
    {
      "name": "proposeCodeHash",
      "docs": [
        "Starts the timelock for a new approved grader build. The hash is public",
        "from this moment, so creators see a change coming before it applies."
      ],
      "discriminator": [
        187,
        92,
        250,
        195,
        116,
        213,
        107,
        217
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "codeHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "reclaim",
      "docs": [
        "If no grader settles before the channel expires, the trainer takes everything back."
      ],
      "discriminator": [
        44,
        177,
        236,
        249,
        145,
        109,
        163,
        186
      ],
      "accounts": [
        {
          "name": "trainer",
          "writable": true,
          "signer": true
        },
        {
          "name": "channel",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "channel"
              }
            ]
          }
        },
        {
          "name": "trainerToken",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "recordResult",
      "docs": [
        "A sealed-test score (badge) or a before/after improvement record."
      ],
      "discriminator": [
        208,
        243,
        63,
        218,
        63,
        116,
        76,
        80
      ],
      "accounts": [
        {
          "name": "grader",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "graderRecord",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  114,
                  97,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "grader"
              }
            ]
          }
        },
        {
          "name": "gym"
        },
        {
          "name": "result",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  115,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "gym"
              },
              {
                "kind": "arg",
                "path": "runId"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "runId",
          "type": {
            "array": [
              "u8",
              16
            ]
          }
        },
        {
          "name": "kind",
          "type": "u8"
        },
        {
          "name": "modelBefore",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "modelAfter",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "beforeBps",
          "type": "u16"
        },
        {
          "name": "afterBps",
          "type": "u16"
        },
        {
          "name": "ciBps",
          "type": "u16"
        },
        {
          "name": "heldoutN",
          "type": "u16"
        },
        {
          "name": "reps",
          "type": "u64"
        },
        {
          "name": "cost",
          "type": "u64"
        }
      ]
    },
    {
      "name": "registerGrader",
      "docs": [
        "Records that `grader` is a sealed grader running `code_hash`. Called on",
        "first attestation and again before expiry to renew."
      ],
      "discriminator": [
        191,
        10,
        240,
        24,
        243,
        7,
        144,
        143
      ],
      "accounts": [
        {
          "name": "attestationAuthority",
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "graderRecord",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  114,
                  97,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "arg",
                "path": "grader"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "grader",
          "type": "pubkey"
        },
        {
          "name": "encKey",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "codeHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "hardware",
          "type": "u8"
        },
        {
          "name": "reportSlot",
          "type": "u64"
        },
        {
          "name": "expiresAt",
          "type": "i64"
        }
      ]
    },
    {
      "name": "revokeCodeHash",
      "docs": [
        "Removing trust is immediate: every grader running this build stops being verified."
      ],
      "discriminator": [
        215,
        13,
        0,
        147,
        233,
        190,
        150,
        187
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "codeHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "settle",
      "docs": [
        "Closes the tab. The instruction before this one must be an Ed25519",
        "signature check of the trainer's voucher for exactly `amount`, and the",
        "caller must be a verified grader. Pays leader, contributors and the",
        "platform, refunds the rest to the trainer, and closes the channel."
      ],
      "discriminator": [
        175,
        42,
        185,
        87,
        144,
        131,
        102,
        212
      ],
      "accounts": [
        {
          "name": "grader",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "graderRecord",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  114,
                  97,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "grader"
              }
            ]
          }
        },
        {
          "name": "gym"
        },
        {
          "name": "channel",
          "writable": true
        },
        {
          "name": "trainer",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "channel"
              }
            ]
          }
        },
        {
          "name": "leaderToken",
          "writable": true
        },
        {
          "name": "contributorToken",
          "writable": true
        },
        {
          "name": "treasury",
          "writable": true
        },
        {
          "name": "trainerToken",
          "writable": true
        },
        {
          "name": "instructions",
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "channel",
      "discriminator": [
        49,
        159,
        99,
        106,
        220,
        87,
        219,
        88
      ]
    },
    {
      "name": "config",
      "discriminator": [
        155,
        12,
        170,
        224,
        30,
        250,
        204,
        130
      ]
    },
    {
      "name": "graderRecord",
      "discriminator": [
        114,
        156,
        254,
        194,
        164,
        34,
        208,
        189
      ]
    },
    {
      "name": "gym",
      "discriminator": [
        106,
        7,
        149,
        4,
        207,
        231,
        184,
        159
      ]
    },
    {
      "name": "resultRecord",
      "discriminator": [
        149,
        200,
        78,
        8,
        184,
        123,
        188,
        35
      ]
    }
  ],
  "events": [
    {
      "name": "channelOpened",
      "discriminator": [
        253,
        213,
        255,
        96,
        31,
        188,
        47,
        170
      ]
    },
    {
      "name": "codeHashActivated",
      "discriminator": [
        150,
        45,
        251,
        148,
        85,
        18,
        1,
        14
      ]
    },
    {
      "name": "codeHashProposed",
      "discriminator": [
        141,
        116,
        192,
        253,
        162,
        99,
        248,
        122
      ]
    },
    {
      "name": "codeHashRevoked",
      "discriminator": [
        243,
        82,
        129,
        151,
        253,
        93,
        212,
        103
      ]
    },
    {
      "name": "exclusiveGranted",
      "discriminator": [
        118,
        187,
        17,
        130,
        222,
        67,
        187,
        12
      ]
    },
    {
      "name": "graderRegistered",
      "discriminator": [
        169,
        207,
        137,
        18,
        207,
        24,
        76,
        136
      ]
    },
    {
      "name": "gymCreated",
      "discriminator": [
        139,
        25,
        179,
        126,
        97,
        18,
        24,
        62
      ]
    },
    {
      "name": "reclaimed",
      "discriminator": [
        230,
        25,
        32,
        135,
        40,
        167,
        137,
        130
      ]
    },
    {
      "name": "resultRecorded",
      "discriminator": [
        239,
        92,
        133,
        98,
        80,
        25,
        55,
        13
      ]
    },
    {
      "name": "settled",
      "discriminator": [
        232,
        210,
        40,
        17,
        142,
        124,
        145,
        238
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "graderNotVerified",
      "msg": "Grader not verified: no live record for this key running approved code"
    },
    {
      "code": 6001,
      "name": "graderRecordExpired",
      "msg": "Grader record has expired; the grader must re-attest"
    },
    {
      "code": 6002,
      "name": "codeNotApproved",
      "msg": "Grader code is not on the approved list"
    },
    {
      "code": 6003,
      "name": "attestationRequired",
      "msg": "A hardware attestation is required"
    },
    {
      "code": 6004,
      "name": "staleReport",
      "msg": "Hardware report is tied to a slot that is too old"
    },
    {
      "code": 6005,
      "name": "approvedListFull",
      "msg": "Approved list is full"
    },
    {
      "code": 6006,
      "name": "alreadyApproved",
      "msg": "Code hash is already approved"
    },
    {
      "code": 6007,
      "name": "nothingPending",
      "msg": "No code hash is pending"
    },
    {
      "code": 6008,
      "name": "timelockActive",
      "msg": "The timelock for this code hash has not passed yet"
    },
    {
      "code": 6009,
      "name": "badSplit",
      "msg": "Leader, contributor and platform shares must add up to 100%"
    },
    {
      "code": 6010,
      "name": "exclusiveWindow",
      "msg": "This Gym is under an exclusive window for another trainer"
    },
    {
      "code": 6011,
      "name": "overDeposit",
      "msg": "Settlement amount exceeds the deposit"
    },
    {
      "code": 6012,
      "name": "voucherMissing",
      "msg": "Missing Ed25519 voucher check before settle"
    },
    {
      "code": 6013,
      "name": "voucherInvalid",
      "msg": "Malformed voucher check"
    },
    {
      "code": 6014,
      "name": "voucherWrongSigner",
      "msg": "Voucher was not signed by the channel's trainer"
    },
    {
      "code": 6015,
      "name": "voucherWrongMessage",
      "msg": "Voucher does not match this channel and amount"
    },
    {
      "code": 6016,
      "name": "channelStillOpen",
      "msg": "Channel has not expired yet"
    },
    {
      "code": 6017,
      "name": "badArgument",
      "msg": "Invalid argument"
    }
  ],
  "types": [
    {
      "name": "channel",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "trainer",
            "type": "pubkey"
          },
          {
            "name": "gym",
            "type": "pubkey"
          },
          {
            "name": "nonce",
            "type": "u64"
          },
          {
            "name": "deposit",
            "type": "u64"
          },
          {
            "name": "openedAt",
            "type": "i64"
          },
          {
            "name": "expiresAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "channelOpened",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "channel",
            "type": "pubkey"
          },
          {
            "name": "trainer",
            "type": "pubkey"
          },
          {
            "name": "gym",
            "type": "pubkey"
          },
          {
            "name": "deposit",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "codeHashActivated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "codeHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "codeHashProposed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "codeHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "effectiveAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "codeHashRevoked",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "codeHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "config",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "attestationAuthority",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "approved",
            "type": {
              "vec": {
                "array": [
                  "u8",
                  32
                ]
              }
            }
          },
          {
            "name": "pendingHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "pendingEffectiveAt",
            "type": "i64"
          },
          {
            "name": "hasPending",
            "type": "bool"
          },
          {
            "name": "timelockSecs",
            "type": "i64"
          },
          {
            "name": "allowUnattested",
            "docs": [
              "Devnet only: accept graders with no hardware report (hardware = 0)."
            ],
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "exclusiveGranted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "gym",
            "type": "pubkey"
          },
          {
            "name": "holder",
            "type": "pubkey"
          },
          {
            "name": "until",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "graderRecord",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "grader",
            "type": "pubkey"
          },
          {
            "name": "encKey",
            "docs": [
              "X25519 key creators encrypt Gym bundles to."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "codeHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "hardware",
            "type": "u8"
          },
          {
            "name": "source",
            "type": "u8"
          },
          {
            "name": "reportSlot",
            "type": "u64"
          },
          {
            "name": "expiresAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "graderRegistered",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "grader",
            "type": "pubkey"
          },
          {
            "name": "codeHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "hardware",
            "type": "u8"
          },
          {
            "name": "expiresAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "gym",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "gymId",
            "type": "string"
          },
          {
            "name": "leader",
            "type": "pubkey"
          },
          {
            "name": "leaderToken",
            "type": "pubkey"
          },
          {
            "name": "contributorToken",
            "type": "pubkey"
          },
          {
            "name": "pricePerRep",
            "type": "u64"
          },
          {
            "name": "leaderBps",
            "type": "u16"
          },
          {
            "name": "contributorBps",
            "type": "u16"
          },
          {
            "name": "platformBps",
            "type": "u16"
          },
          {
            "name": "grader",
            "type": "pubkey"
          },
          {
            "name": "graderVersion",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "trainTasks",
            "type": "u16"
          },
          {
            "name": "heldoutTasks",
            "type": "u16"
          },
          {
            "name": "exclusiveHolder",
            "type": "pubkey"
          },
          {
            "name": "exclusiveUntil",
            "type": "i64"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "gymCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "gym",
            "type": "pubkey"
          },
          {
            "name": "grader",
            "type": "pubkey"
          },
          {
            "name": "graderVersion",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "pricePerRep",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "reclaimed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "channel",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "resultRecord",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "gym",
            "type": "pubkey"
          },
          {
            "name": "grader",
            "type": "pubkey"
          },
          {
            "name": "graderVersion",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "runId",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "kind",
            "type": "u8"
          },
          {
            "name": "modelBefore",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "modelAfter",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "beforeBps",
            "type": "u16"
          },
          {
            "name": "afterBps",
            "type": "u16"
          },
          {
            "name": "ciBps",
            "type": "u16"
          },
          {
            "name": "heldoutN",
            "type": "u16"
          },
          {
            "name": "reps",
            "type": "u64"
          },
          {
            "name": "cost",
            "type": "u64"
          },
          {
            "name": "recordedAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "resultRecorded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "result",
            "type": "pubkey"
          },
          {
            "name": "gym",
            "type": "pubkey"
          },
          {
            "name": "kind",
            "type": "u8"
          },
          {
            "name": "beforeBps",
            "type": "u16"
          },
          {
            "name": "afterBps",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "settled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "channel",
            "type": "pubkey"
          },
          {
            "name": "gym",
            "type": "pubkey"
          },
          {
            "name": "grader",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "leader",
            "type": "u64"
          },
          {
            "name": "contributors",
            "type": "u64"
          },
          {
            "name": "platform",
            "type": "u64"
          },
          {
            "name": "refund",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
