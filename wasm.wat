(module
  (memory (export "memory") 1)
  ;; ctx: 0 - 63
  ;; output: 64 - 127
  ;; scratch: 128 - 192

  (func $quarter_round
    (param $a i32) ;; offset by 128
    (param $b i32) ;; offset by 128
    (param $c i32) ;; offset by 128
    (param $d i32) ;; offset by 128
    (local $xa i32)
    (local $xb i32)
    (local $xc i32)
    (local $xd i32)

    ;; x[a] = x[a] + x[b];
    ;; x[d] = (x[d] ^ x[a]) rotl 16
    (local.set $xd
      (i32.rotl
        (i32.xor  (i32.load (local.get $d)) 
                  (local.tee $xa
                    (i32.add  (i32.load (local.get $a))
                              (local.tee $xb (i32.load (local.get $b))))))
        (i32.const 16)))

    ;; x[c] = x[c] + x[d];
    ;; x[b] = (x[b] ^ x[c]) rotl 12
    (local.set $xb 
      (i32.rotl
        (i32.xor  (local.get $xb)
                  (local.tee $xc
                    (i32.add (i32.load (local.get $c)) (local.get $xd))))
        (i32.const 12)))

    ;; x[a] = x[a] + x[b];
    (i32.store  (local.get $a)
                (local.tee $xa (i32.add (local.get $xa) (local.get $xb))))
    ;; x[d] = (x[d] ^ x[a]) rotl 8
    (i32.store  (local.get $d)
                (local.tee $xd
                  (i32.rotl
                    (i32.xor  (local.get $xd)
                              (local.get $xa))
                    (i32.const 8))))

    ;; x[c] = x[c] + x[d];
    (i32.store  (local.get $c)
                (local.tee $xc (i32.add (local.get $xc) (local.get $xd))))
    ;; x[b] = (x[b] ^ x[c]) rotl 7
    (i32.store  (local.get $b)
                (i32.rotl (i32.xor (local.get $xb) (local.get $xc)) (i32.const 7)))
  )

  (func $next_bytes (param $rounds i32)
    (local $i i32)
    (local $t i32)

    ;; Copy context into scratch space
    (local.set $i (i32.const 0))
    (block
      (loop
        ;; Move 8 bytes at a time
        ;; from i (context) to i + 128 (scratch)
        (i64.store
          (i32.add (local.get $i) (i32.const 128))
          (i64.load (local.get $i)))

        ;; Increment by 8 bytes
        ;; and break if we hit 64
        (br_if 1
          (i32.eq
            (i32.const 64)
            (local.tee $i
              (i32.add (local.get $i) (i32.const 8)))))
        (br 0)
      )
    )

    ;; Perform rounds on data in scratch space
    (block
      (loop
        (call $quarter_round
          ;; Indices: 0, 4, 8, 12
          ;; Offsets: 0, 16, 32, 48 + 128
          (i32.const 128) (i32.const 144)
          (i32.const 160) (i32.const 176))
        (call $quarter_round
          ;; Indices: 1, 5, 9, 13
          ;; Offsets: 4, 20, 36, 52 + 128
          (i32.const 132) (i32.const 148)
          (i32.const 164) (i32.const 180))
        (call $quarter_round
          ;; Indices: 2, 6, 10, 14
          ;; Offsets: 8, 24, 40, 56 + 128
          (i32.const 136) (i32.const 152)
          (i32.const 168) (i32.const 184))
        (call $quarter_round
          ;; Indices: 3, 7, 11, 15
          ;; Offsets: 12, 28, 44, 60 + 128
          (i32.const 140) (i32.const 156)
          (i32.const 172) (i32.const 188))
          
        (call $quarter_round
          ;; Indices: 0, 5, 10, 15
          ;; Offsets: 0, 20, 40, 60 + 128
          (i32.const 128) (i32.const 148)
          (i32.const 168) (i32.const 188))
        (call $quarter_round
          ;; Indices: 1, 6, 11, 12
          ;; Offsets: 4, 24, 44, 48 + 128
          (i32.const 132) (i32.const 152)
          (i32.const 172) (i32.const 176))
        (call $quarter_round
          ;; Indices: 2, 7, 8, 13
          ;; Offsets: 8, 28, 32, 52 + 128
          (i32.const 136) (i32.const 156)
          (i32.const 160) (i32.const 180))
        (call $quarter_round
          ;; Indices: 3, 4, 9, 14
          ;; Offsets: 12, 16, 36, 56 + 128
          (i32.const 140) (i32.const 144)
          (i32.const 164) (i32.const 184))
        (br_if 1 (i32.eqz
          (local.tee $rounds
            (i32.sub (local.get $rounds) (i32.const 2)))))
        (br 0)
      )
    )

    ;; Copy scratch space to output in little-endian order   
    ;; output starts at 64
    (local.set $i (i32.const 64))
    ;; $rounds is already re-set to 0
    (block
      (loop
        (i32.store8
          (local.get $i)
          (local.tee $t
            (i32.add ;; Add context back into scratch data as we go
              (i32.load (local.get $rounds))
              (i32.load
                (i32.add
                  (i32.const 128) ;; scratch space starts at 128
                  (local.get $rounds))))))

        (i32.store8
          (local.tee $i (i32.add (local.get $i) (i32.const 1)))
          (i32.shr_u (local.get $t) (i32.const 8)))

        (i32.store8
          (local.tee $i (i32.add (local.get $i) (i32.const 1)))
          (i32.shr_u (local.get $t) (i32.const 16)))
        
        (i32.store8
          (local.tee $i (i32.add (local.get $i) (i32.const 1)))
          (i32.shr_u (local.get $t) (i32.const 24)))

        (local.set $i (i32.add (local.get $i) (i32.const 1)))

        (br_if 1
          (i32.eq
            (i32.const 64)
            (local.tee $rounds ;; move 4 bytes at a time
              (i32.add (local.get $rounds) (i32.const 4)))))
        (br 0)
      )
    )
    
    ;; Increment Counter
    (i32.store
      (i32.const 48)
      (local.tee $t
        (i32.add
          (i32.load (i32.const 48))
          (i32.const 1))))

    (block
      (br_if 1 (i32.ne (i32.const 0) (local.get $t)))
      (i32.store
        (i32.const 52)
        (i32.add
          (i32.const 1)
          (i32.load (i32.const 52))))
    )
  )

  (export "next_bytes" (func $next_bytes))
)