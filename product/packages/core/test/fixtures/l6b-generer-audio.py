"""
L6-B · fabrique LOCALE des prises audio de test (aucun réseau, aucun service).

Lancé une fois depuis ce dossier : `python3 -I l6b-generer-audio.py`. Les
fichiers produits sont commités ; leurs durées de référence viennent
d'oracles INDÉPENDANTS du code mesuré (voir docs/studios-v2/L6-IDENTITES-VOIX.md) :
  · WAV : le module standard `wave` de Python (getnframes / getframerate) ;
  · MP3 : le décodeur MP3 de Chromium (`AudioContext.decodeAudioData`).

  l6b-voix-16k.wav    · `wave` de Python, PCM 16 bits mono 16 000 Hz, 1,7 s de la 440 Hz
  l6b-voix-liste.wav  · RIFF écrit à la main, bloc LIST de taille impaire (octet de bourrage)
                        AVANT le bloc data, PCM 24 bits stéréo 44 100 Hz, 11 025 trames
  l6b-voix-cbr.mp3    · étiquette ID3v2, 100 trames MPEG-1 couche III 64 kbit/s 44 100 Hz mono
                        (trames silencieuses : informations latérales nulles), étiquette ID3v1
  l6b-voix-xing.mp3   · trame Xing (drapeau « frames » = 50) puis 50 trames MPEG-2 couche III
                        64 kbit/s 22 050 Hz mono
"""
import math, struct, wave

with wave.open('l6b-voix-16k.wav', 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000)
    w.writeframes(b''.join(struct.pack('<h', int(12000 * math.sin(2 * math.pi * 440 * i / 16000))) for i in range(27200)))

def u32(x): return struct.pack('<I', x)
def u16(x): return struct.pack('<H', x)
trames = 11025
data = b''.join(struct.pack('<i', int(3000000 * math.sin(2 * math.pi * 220 * i / 44100)))[:3] * 2 for i in range(trames))
fmt = u16(1) + u16(2) + u32(44100) + u32(44100 * 6) + u16(6) + u16(24)
liste = b'INFOISFT' + u32(5) + b'l6b\x00\x00'   # 17 octets : taille impaire
corps = b'WAVE' + b'fmt ' + u32(len(fmt)) + fmt + b'LIST' + u32(len(liste)) + liste + b'\x00' + b'data' + u32(len(data)) + data
open('l6b-voix-liste.wav', 'wb').write(b'RIFF' + u32(len(corps)) + corps)

def synchsafe(n): return bytes([(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f])
id3 = b'ID3\x03\x00\x00' + synchsafe(30) + b'TIT2' + struct.pack('>I', 9) + b'\x00\x00' + b'\x00l6b voix' + b'\x00' * 11
entete_cbr = bytes([0xFF, 0xFB, 0x50, 0xC4])        # MPEG-1, couche III, 64 kbit/s, 44 100 Hz, mono
trame_cbr = entete_cbr + b'\x00' * (144 * 64000 // 44100 - 4)
id3v1 = b'TAG' + b'l6b voix'.ljust(30, b'\x00') + b'\x00' * 95
open('l6b-voix-cbr.mp3', 'wb').write(id3 + trame_cbr * 100 + id3v1)

entete_v2 = bytes([0xFF, 0xF3, 0x80, 0xC4])         # MPEG-2, couche III, 64 kbit/s, 22 050 Hz, mono
longueur = 72 * 64000 // 22050
xing = bytearray(entete_v2 + b'\x00' * (longueur - 4))
xing[4 + 9:4 + 9 + 12] = b'Xing' + struct.pack('>I', 1) + struct.pack('>I', 50)
open('l6b-voix-xing.mp3', 'wb').write(bytes(xing) + (entete_v2 + b'\x00' * (longueur - 4)) * 50)

for f in ['l6b-voix-16k.wav', 'l6b-voix-liste.wav']:
    with wave.open(f) as w:
        print(f, w.getnframes(), w.getframerate(), round(w.getnframes() * 1000 / w.getframerate()), 'ms')
