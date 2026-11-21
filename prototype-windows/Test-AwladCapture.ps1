<#
===============================================================================
  AwladShield — Test-AwladCapture.ps1  (ETAPE 0 — SONDE DIAGNOSTIQUE JETABLE)
===============================================================================
  AVERTISSEMENT / BANNIERE DE SECURITE
  -----------------------------------------------------------------------------
  Ceci est un PROTOTYPE DE DIAGNOSTIC JETABLE (un "spike"), destine UNIQUEMENT
  a MESURER ce qu'un processus utilisateur standard peut capturer sur un PC
  Windows, AVANT de construire le vrai outil de controle parental AwladShield.

  N'EXECUTEZ CE SCRIPT QUE SUR DES ORDINATEURS QUE VOUS POSSEDEZ ET QUE VOUS
  ADMINISTREZ (les PC de vos propres enfants mineurs, controle parental
  informe/autorise). Ne l'utilisez JAMAIS sur la machine d'autrui.

  Ce script NE TRANSMET RIEN sur le reseau. Il n'ENVOIE aucune donnee.
  Le rapport genere (awlad-capture-report.txt) est concu pour NE JAMAIS
  contenir de secret reel : ni mot de passe, ni texte saisi, ni URL complete.
  Seulement des comptes, des booleens, des verdicts, des domaines et des
  echantillons fortement masques (ex: longueur d'un mot de passe uniquement).
===============================================================================
#>

# -----------------------------------------------------------------------------
# Contexte / chemins
# -----------------------------------------------------------------------------
$ErrorActionPreference = 'Continue'
$script:StartDir   = (Get-Location).Path
$script:ReportPath = Join-Path $script:StartDir 'awlad-capture-report.txt'
$script:ShotPath   = Join-Path $script:StartDir 'awlad-screenshot-sample.png'
$script:TempFiles  = New-Object System.Collections.ArrayList
$script:Lines      = New-Object System.Collections.ArrayList

function Add-Line {
    param([string]$Text = '')
    [void]$script:Lines.Add($Text)
    Write-Host $Text
}

# -----------------------------------------------------------------------------
# Code natif partage (winsqlite3 + DPAPI + AES-GCM + user32). Compile UNE fois.
# Tout est encapsule : si la compilation echoue, les sondes concernees le
# signalent en ERROR au lieu de planter le script.
# -----------------------------------------------------------------------------
$script:NativeOK  = $false
$script:NativeErr = $null

$csharp = @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;

namespace Awlad {

  // ---- Lecteur minimal winsqlite3.dll (lecture seule) -----------------------
  // winsqlite3.dll est present sur Windows 10 1703+ et expose l'API C sqlite3.
  public static class Sql {
    const int SQLITE_OK=0, SQLITE_ROW=100;
    const int SQLITE_OPEN_READONLY=1;
    const int T_INT=1, T_FLOAT=2, T_TEXT=3, T_BLOB=4, T_NULL=5;

    [DllImport("winsqlite3.dll", EntryPoint="sqlite3_open_v2")]
    static extern int open_v2(byte[] filename, out IntPtr db, int flags, IntPtr vfs);
    [DllImport("winsqlite3.dll", EntryPoint="sqlite3_prepare_v2")]
    static extern int prepare_v2(IntPtr db, byte[] sql, int n, out IntPtr stmt, IntPtr tail);
    [DllImport("winsqlite3.dll", EntryPoint="sqlite3_step")]
    static extern int step(IntPtr stmt);
    [DllImport("winsqlite3.dll", EntryPoint="sqlite3_column_count")]
    static extern int col_count(IntPtr stmt);
    [DllImport("winsqlite3.dll", EntryPoint="sqlite3_column_type")]
    static extern int col_type(IntPtr stmt, int i);
    [DllImport("winsqlite3.dll", EntryPoint="sqlite3_column_bytes")]
    static extern int col_bytes(IntPtr stmt, int i);
    [DllImport("winsqlite3.dll", EntryPoint="sqlite3_column_blob")]
    static extern IntPtr col_blob(IntPtr stmt, int i);
    [DllImport("winsqlite3.dll", EntryPoint="sqlite3_column_text")]
    static extern IntPtr col_text(IntPtr stmt, int i);
    [DllImport("winsqlite3.dll", EntryPoint="sqlite3_column_int64")]
    static extern long col_int64(IntPtr stmt, int i);
    [DllImport("winsqlite3.dll", EntryPoint="sqlite3_finalize")]
    static extern int finalize(IntPtr stmt);
    [DllImport("winsqlite3.dll", EntryPoint="sqlite3_close")]
    static extern int close(IntPtr db);

    // Chaque cellule renvoyee est : string, long (boxed), byte[] ou null.
    public static List<object[]> Query(string path, string sql) {
      IntPtr db;
      byte[] fn = Encoding.UTF8.GetBytes(path + "\0");
      int rc = open_v2(fn, out db, SQLITE_OPEN_READONLY, IntPtr.Zero);
      if (rc != SQLITE_OK) { if (db != IntPtr.Zero) close(db); throw new Exception("sqlite open rc=" + rc); }
      try {
        IntPtr stmt;
        byte[] q = Encoding.UTF8.GetBytes(sql + "\0");
        rc = prepare_v2(db, q, -1, out stmt, IntPtr.Zero);
        if (rc != SQLITE_OK) throw new Exception("sqlite prepare rc=" + rc);
        var rows = new List<object[]>();
        try {
          int cols = col_count(stmt);
          while (step(stmt) == SQLITE_ROW) {
            var row = new object[cols];
            for (int i = 0; i < cols; i++) {
              int t = col_type(stmt, i);
              if (t == T_TEXT) {
                IntPtr p = col_text(stmt, i); int nb = col_bytes(stmt, i);
                byte[] b = new byte[nb]; if (nb > 0) Marshal.Copy(p, b, 0, nb);
                row[i] = Encoding.UTF8.GetString(b);
              } else if (t == T_BLOB) {
                IntPtr p = col_blob(stmt, i); int nb = col_bytes(stmt, i);
                byte[] b = new byte[nb]; if (nb > 0) Marshal.Copy(p, b, 0, nb);
                row[i] = b;
              } else if (t == T_INT) {
                row[i] = col_int64(stmt, i);
              } else { row[i] = null; }
            }
            rows.Add(row);
          }
        } finally { finalize(stmt); }
        return rows;
      } finally { close(db); }
    }
  }

  // ---- DPAPI (CryptUnprotectData, utilisateur courant) ----------------------
  public static class Dpapi {
    [StructLayout(LayoutKind.Sequential)]
    struct BLOB { public int cb; public IntPtr pb; }
    [DllImport("crypt32.dll", SetLastError=true, CharSet=CharSet.Auto)]
    static extern bool CryptUnprotectData(ref BLOB pIn, IntPtr desc, IntPtr ent, IntPtr res, IntPtr prompt, int flags, ref BLOB pOut);
    [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr p);

    public static byte[] Unprotect(byte[] data) {
      BLOB bin = new BLOB(), bout = new BLOB();
      bin.pb = Marshal.AllocHGlobal(data.Length);
      Marshal.Copy(data, 0, bin.pb, data.Length);
      bin.cb = data.Length;
      try {
        if (!CryptUnprotectData(ref bin, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, 0, ref bout))
          throw new Exception("CryptUnprotectData err=" + Marshal.GetLastWin32Error());
        byte[] outData = new byte[bout.cb];
        Marshal.Copy(bout.pb, outData, 0, bout.cb);
        return outData;
      } finally {
        Marshal.FreeHGlobal(bin.pb);
        if (bout.pb != IntPtr.Zero) LocalFree(bout.pb);
      }
    }
  }

  // ---- AES-256-GCM via BCrypt (fonctionne sur PS 5.1 ET PS 7) ---------------
  // On evite [System.Security.Cryptography.AesGcm] (absent de .NET Framework
  // de Windows PowerShell 5.1) et on passe par l'API CNG bcrypt.dll.
  public static class Gcm {
    [DllImport("bcrypt.dll")] static extern int BCryptOpenAlgorithmProvider(out IntPtr h, string id, string impl, int flags);
    [DllImport("bcrypt.dll")] static extern int BCryptSetProperty(IntPtr h, string prop, byte[] val, int cb, int flags);
    [DllImport("bcrypt.dll")] static extern int BCryptGenerateSymmetricKey(IntPtr hAlg, out IntPtr hKey, IntPtr keyObj, int cbKeyObj, byte[] secret, int cbSecret, int flags);
    [DllImport("bcrypt.dll")] static extern int BCryptDecrypt(IntPtr hKey, byte[] input, int cbInput, ref AUTH_INFO info, byte[] iv, int cbIv, byte[] output, int cbOutput, out int cbResult, int flags);
    [DllImport("bcrypt.dll")] static extern int BCryptCloseAlgorithmProvider(IntPtr h, int flags);
    [DllImport("bcrypt.dll")] static extern int BCryptDestroyKey(IntPtr h);

    [StructLayout(LayoutKind.Sequential)]
    struct AUTH_INFO {
      public int cbSize; public int dwInfoVersion;
      public IntPtr pbNonce;      public int cbNonce;
      public IntPtr pbAuthData;   public int cbAuthData;
      public IntPtr pbTag;        public int cbTag;
      public IntPtr pbMacContext; public int cbMacContext;
      public int cbAAD; public long cbData; public int dwFlags;
    }

    public static byte[] Decrypt(byte[] key, byte[] nonce, byte[] cipher, byte[] tag) {
      IntPtr hAlg, hKey;
      int rc = BCryptOpenAlgorithmProvider(out hAlg, "AES", null, 0);
      if (rc != 0) throw new Exception("BCryptOpen rc=" + rc);
      try {
        byte[] mode = Encoding.Unicode.GetBytes("ChainingModeGCM\0");
        rc = BCryptSetProperty(hAlg, "ChainingMode", mode, mode.Length, 0);
        if (rc != 0) throw new Exception("BCryptSetProperty rc=" + rc);
        rc = BCryptGenerateSymmetricKey(hAlg, out hKey, IntPtr.Zero, 0, key, key.Length, 0);
        if (rc != 0) throw new Exception("BCryptGenerateSymmetricKey rc=" + rc);
        try {
          AUTH_INFO info = new AUTH_INFO();
          info.cbSize = Marshal.SizeOf(typeof(AUTH_INFO));
          info.dwInfoVersion = 1;
          GCHandle gn = GCHandle.Alloc(nonce, GCHandleType.Pinned);
          GCHandle gt = GCHandle.Alloc(tag, GCHandleType.Pinned);
          try {
            info.pbNonce = gn.AddrOfPinnedObject(); info.cbNonce = nonce.Length;
            info.pbTag   = gt.AddrOfPinnedObject(); info.cbTag   = tag.Length;
            byte[] outBuf = new byte[cipher.Length];
            int cbRes;
            rc = BCryptDecrypt(hKey, cipher, cipher.Length, ref info, null, 0, outBuf, outBuf.Length, out cbRes, 0);
            if (rc != 0) throw new Exception("BCryptDecrypt rc=" + rc);
            if (cbRes != outBuf.Length) { byte[] r = new byte[cbRes]; Array.Copy(outBuf, r, cbRes); return r; }
            return outBuf;
          } finally { gn.Free(); gt.Free(); }
        } finally { BCryptDestroyKey(hKey); }
      } finally { BCryptCloseAlgorithmProvider(hAlg, 0); }
    }
  }

  // ---- user32 : fenetre au premier plan + etat clavier ----------------------
  public static class Win {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowTextW(IntPtr h, StringBuilder sb, int max);
    [DllImport("user32.dll")] static extern int GetWindowThreadProcessId(IntPtr h, out int pid);
    [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);
    [DllImport("user32.dll")] public static extern int GetSystemMetrics(int i);

    public static string Title() {
      IntPtr h = GetForegroundWindow();
      if (h == IntPtr.Zero) return "";
      StringBuilder sb = new StringBuilder(512);
      GetWindowTextW(h, sb, 512);
      return sb.ToString();
    }
    public static int Pid() {
      IntPtr h = GetForegroundWindow();
      if (h == IntPtr.Zero) return 0;
      int pid; GetWindowThreadProcessId(h, out pid); return pid;
    }
  }
}
'@

try {
    Add-Type -TypeDefinition $csharp -ErrorAction Stop
    $script:NativeOK = $true
} catch {
    $script:NativeErr = $_.Exception.Message
}

# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------
function New-Verdict {
    param([string]$Name, [string]$Verdict, [string]$Notes)
    [pscustomobject]@{ Name = $Name; Verdict = $Verdict; Notes = $Notes }
}

function Get-HostOnly {
    param([string]$Url)
    try {
        $u = [Uri]$Url
        if ($u.Host) { return $u.Host } else { return '[hote-inconnu]' }
    } catch { return '[url-non-analysable]' }
}

function Copy-Locked {
    # Copie un fichier (eventuellement verrouille) vers %TEMP%, avec ses
    # fichiers -wal/-shm/-journal si presents. Retourne le chemin temporaire.
    param([string]$Src)
    $tmp = Join-Path $env:TEMP ('awlad_' + [IO.Path]::GetRandomFileName())
    Copy-Item -LiteralPath $Src -Destination $tmp -Force -ErrorAction Stop
    [void]$script:TempFiles.Add($tmp)
    foreach ($ext in '-wal','-shm','-journal') {
        if (Test-Path -LiteralPath ($Src + $ext)) {
            try {
                Copy-Item -LiteralPath ($Src + $ext) -Destination ($tmp + $ext) -Force -ErrorAction Stop
                [void]$script:TempFiles.Add($tmp + $ext)
            } catch {}
        }
    }
    return $tmp
}

function Sub-Bytes {
    param([byte[]]$Data, [int]$Start, [int]$Len)
    $out = New-Object byte[] $Len
    [Array]::Copy($Data, $Start, $out, 0, $Len)
    return ,$out
}

# -----------------------------------------------------------------------------
# PROBE A — Application au premier plan + titre
# -----------------------------------------------------------------------------
function Probe-A {
    Add-Line "[Sonde A] Application au premier plan + titre (~15 s)..."
    if (-not $script:NativeOK) { return (New-Verdict 'A - Premier plan + titre' 'ERROR' "Code natif non compile: $script:NativeErr") }
    try {
        $seenApps   = New-Object System.Collections.Generic.HashSet[string]
        $seenTitles = New-Object System.Collections.Generic.HashSet[string]
        $samples = 0
        for ($i = 0; $i -lt 15; $i++) {
            $title = [Awlad.Win]::Title()
            $pid   = [Awlad.Win]::Pid()
            $proc  = '?'
            if ($pid -ne 0) {
                try { $proc = (Get-Process -Id $pid -ErrorAction Stop).ProcessName } catch { $proc = '?' }
            }
            $samples++
            [void]$seenApps.Add($proc)
            if ($title) {
                $t = $title
                if ($t.Length -gt 40) { $t = $t.Substring(0,40) }
                [void]$seenTitles.Add(($proc + '|' + $t))
            }
            Start-Sleep -Milliseconds 1000
        }
        $notes = "Echantillons=$samples; apps distinctes=$($seenApps.Count); titres distincts=$($seenTitles.Count)"
        $verdict = if ($seenApps.Count -ge 1 -and $samples -gt 0) { 'PASS' } else { 'FAIL' }
        if ($seenApps.Count -le 1 -and $seenTitles.Count -le 1) {
            $verdict = 'PARTIAL'
            $notes += " (peu de variation: lancez d'autres fenetres pendant le test)"
        }
        return (New-Verdict 'A - Premier plan + titre' $verdict $notes)
    } catch {
        return (New-Verdict 'A - Premier plan + titre' 'ERROR' $_.Exception.Message)
    }
}

# -----------------------------------------------------------------------------
# PROBE B — Capture d'ecran
# -----------------------------------------------------------------------------
function Probe-B {
    Add-Line "[Sonde B] Capture d'ecran (ecran principal)..."
    try {
        $w = 0; $h = 0; $ox = 0; $oy = 0
        try {
            Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop
            Add-Type -AssemblyName System.Drawing -ErrorAction Stop
            $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
            $w = $b.Width; $h = $b.Height; $ox = $b.X; $oy = $b.Y
        } catch {
            # Repli : dimensions via GetSystemMetrics (0=largeur, 1=hauteur)
            Add-Type -AssemblyName System.Drawing -ErrorAction Stop
            if (-not $script:NativeOK) { throw "WinForms indisponible et code natif non compile: $script:NativeErr" }
            $w = [Awlad.Win]::GetSystemMetrics(0)
            $h = [Awlad.Win]::GetSystemMetrics(1)
        }
        if ($w -le 0 -or $h -le 0) { throw "Dimensions d'ecran invalides ($w x $h)" }

        $bmp = New-Object System.Drawing.Bitmap $w, $h
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.CopyFromScreen($ox, $oy, 0, 0, (New-Object System.Drawing.Size($w, $h)))
        $g.Dispose()
        $bmp.Save($script:ShotPath, [System.Drawing.Imaging.ImageFormat]::Png)
        $bmp.Dispose()

        $size = (Get-Item -LiteralPath $script:ShotPath).Length
        $kb = [math]::Round($size / 1KB, 1)
        if ($size -le 0) { return (New-Verdict 'B - Capture ecran' 'FAIL' "Fichier vide") }
        $notes = "Image ${w}x${h}, ${kb} Ko, enregistree: $script:ShotPath (contenu NON inclus dans le rapport)"
        return (New-Verdict 'B - Capture ecran' 'PASS' $notes)
    } catch {
        return (New-Verdict 'B - Capture ecran' 'ERROR' $_.Exception.Message)
    }
}

# -----------------------------------------------------------------------------
# PROBE C — Frappes clavier (comptage uniquement, JAMAIS la sequence)
# -----------------------------------------------------------------------------
function Probe-C {
    Add-Line ""
    Add-Line "[Sonde C] Frappes clavier (~20 s)."
    Add-Line "  >>> TAPEZ librement MAINTENANT (de preference dans une autre fenetre :"
    Add-Line "      bloc-notes, navigateur, et aussi un champ de MOT DE PASSE pour tester)."
    Add-Line "      Aucune touche n'est enregistree : seuls des COMPTEURS sont rapportes."
    if (-not $script:NativeOK) { return (New-Verdict 'C - Frappes clavier' 'ERROR' "Code natif non compile: $script:NativeErr") }
    try {
        $prev = New-Object 'bool[]' 256
        $letters = 0; $digits = 0; $other = 0; $total = 0
        $samplesForeignFocus = 0; $samplesHostFocus = 0
        $ownPid = $PID
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        while ($sw.Elapsed.TotalSeconds -lt 20) {
            # Qui a le focus pendant la frappe ? (pour prouver la capture "globale")
            $fgPid = [Awlad.Win]::Pid()
            for ($vk = 8; $vk -le 254; $vk++) {
                $state = [Awlad.Win]::GetAsyncKeyState($vk)
                $down = (($state -band 0x8000) -ne 0)
                if ($down -and -not $prev[$vk]) {
                    # Front montant = une pression
                    $total++
                    if ($vk -ge 0x41 -and $vk -le 0x5A) { $letters++ }
                    elseif ($vk -ge 0x30 -and $vk -le 0x39) { $digits++ }
                    elseif ($vk -ge 0x60 -and $vk -le 0x69) { $digits++ }  # pave numerique
                    else { $other++ }
                    if ($fgPid -ne 0 -and $fgPid -ne $ownPid) { $samplesForeignFocus++ } else { $samplesHostFocus++ }
                }
                $prev[$vk] = $down
            }
            Start-Sleep -Milliseconds 20
        }
        $sw.Stop()
        $notes = "Touches detectees=$total (lettres=$letters, chiffres=$digits, autres=$other). " +
                 "Pressions avec focus sur une AUTRE fenetre=$samplesForeignFocus, sur l'hote=$samplesHostFocus. " +
                 "(Aucune sequence enregistree.)"
        if ($total -eq 0) {
            return (New-Verdict 'C - Frappes clavier' 'FAIL' ("Aucune touche detectee. " + $notes))
        }
        if ($samplesForeignFocus -ge 1) {
            return (New-Verdict 'C - Frappes clavier' 'PASS' $notes)
        }
        return (New-Verdict 'C - Frappes clavier' 'PARTIAL' ("Touches detectees mais seulement avec focus sur l'hote PowerShell; refaites le test en tapant dans une autre fenetre. " + $notes))
    } catch {
        return (New-Verdict 'C - Frappes clavier' 'ERROR' $_.Exception.Message)
    }
}

# -----------------------------------------------------------------------------
# PROBE D — Detection des champs de mot de passe (UI Automation)
# -----------------------------------------------------------------------------
function Probe-D {
    Add-Line ""
    Add-Line "[Sonde D] Detection champ de mot de passe via UI Automation (~15 s)."
    Add-Line "  >>> Cliquez dans differents champs, dont un champ de MOT DE PASSE (navigateur),"
    Add-Line "      pour voir si l'on peut detecter l'etat 'protege' du controle."
    try {
        Add-Type -AssemblyName UIAutomationClient -ErrorAction Stop
        Add-Type -AssemblyName UIAutomationTypes -ErrorAction Stop

        $ctrlTypes = New-Object System.Collections.Generic.HashSet[string]
        $passwordDetected = $false
        $samples = 0; $readOK = 0
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        while ($sw.Elapsed.TotalSeconds -lt 15) {
            $samples++
            try {
                $el = [System.Windows.Automation.AutomationElement]::FocusedElement
                if ($el) {
                    $readOK++
                    $ct = $el.Current.ControlType
                    if ($ct -and $ct.ProgrammaticName) {
                        $name = $ct.ProgrammaticName -replace '^ControlType\.', ''
                        [void]$ctrlTypes.Add($name)
                    }
                    $isPwd = $el.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::IsPasswordProperty)
                    if ($isPwd -is [bool] -and $isPwd) { $passwordDetected = $true }
                }
            } catch {}
            Start-Sleep -Milliseconds 500
        }
        $sw.Stop()
        $types = if ($ctrlTypes.Count -gt 0) { ($ctrlTypes -join ', ') } else { 'aucun' }
        $notes = "Lectures du controle focus reussies=$readOK/$samples; types vus=[$types]; champ mot de passe detecte=$passwordDetected"
        if ($readOK -eq 0) {
            return (New-Verdict 'D - Champ mot de passe (UIA)' 'FAIL' ("Impossible de lire l'element focus. " + $notes))
        }
        if ($passwordDetected) {
            return (New-Verdict 'D - Champ mot de passe (UIA)' 'PASS' $notes)
        }
        return (New-Verdict 'D - Champ mot de passe (UIA)' 'PARTIAL' ("UIA fonctionne mais aucun champ 'IsPassword' detecte pendant le test (avez-vous clique dans un champ mot de passe ?). " + $notes))
    } catch {
        return (New-Verdict 'D - Champ mot de passe (UIA)' 'ERROR' $_.Exception.Message)
    }
}

# -----------------------------------------------------------------------------
# PROBE E — Mots de passe enregistres des navigateurs
#   Rapport : par navigateur, NB trouves / NB dechiffres + liste de DOMAINES.
#   JAMAIS de mot de passe reel : masque a la longueur uniquement.
# -----------------------------------------------------------------------------
function Get-ChromiumKey {
    param([string]$UserDataDir)
    $ls = Join-Path $UserDataDir 'Local State'
    if (-not (Test-Path -LiteralPath $ls)) { return $null }
    $json = Get-Content -Raw -LiteralPath $ls -ErrorAction Stop | ConvertFrom-Json
    $b64 = $json.os_crypt.encrypted_key
    if (-not $b64) { return $null }
    $enc = [Convert]::FromBase64String($b64)
    # Retirer le prefixe "DPAPI" (5 octets) si present
    if ($enc.Length -gt 5) {
        $pfx = [System.Text.Encoding]::ASCII.GetString($enc, 0, 5)
        if ($pfx -eq 'DPAPI') { $enc = Sub-Bytes $enc 5 ($enc.Length - 5) }
    }
    return [Awlad.Dpapi]::Unprotect($enc)
}

function Get-DecryptedLength {
    # Renvoie UNIQUEMENT la longueur (en octets) du clair. Ne renvoie JAMAIS
    # le mot de passe lui-meme, pour qu'aucun appelant ne puisse le journaliser.
    param([byte[]]$Key, [byte[]]$Blob)
    if ($null -eq $Blob -or $Blob.Length -lt 3) { return -1 }
    $pfx = [System.Text.Encoding]::ASCII.GetString($Blob, 0, 3)
    if ($pfx -eq 'v10' -or $pfx -eq 'v11') {
        if ($Blob.Length -lt (3 + 12 + 16)) { return -1 }
        $nonce = Sub-Bytes $Blob 3 12
        $tagStart = $Blob.Length - 16
        $cipherLen = $tagStart - 15
        if ($cipherLen -lt 0) { return -1 }
        $cipher = Sub-Bytes $Blob 15 $cipherLen
        $tag = Sub-Bytes $Blob $tagStart 16
        $plain = [Awlad.Gcm]::Decrypt($Key, $nonce, $cipher, $tag)
        $len = $plain.Length
        $plain = $null
        return $len
    } else {
        # Ancien format Chrome : DPAPI direct
        $plain = [Awlad.Dpapi]::Unprotect($Blob)
        $len = $plain.Length
        $plain = $null
        return $len
    }
}

function Probe-E-Chromium {
    param([string]$BrowserName, [string]$UserDataDir)
    $result = [pscustomobject]@{ Found = 0; Decrypted = 0; Domains = (New-Object System.Collections.Generic.HashSet[string]); Detail = '' }
    if (-not (Test-Path -LiteralPath $UserDataDir)) { $result.Detail = 'non installe'; return $result }
    try {
        $key = Get-ChromiumKey -UserDataDir $UserDataDir
    } catch {
        $result.Detail = "cle AES non recuperee: $($_.Exception.Message)"
        $key = $null
    }
    $profiles = @()
    try {
        $profiles = Get-ChildItem -LiteralPath $UserDataDir -Directory -ErrorAction Stop |
            Where-Object { $_.Name -eq 'Default' -or $_.Name -like 'Profile*' }
    } catch {}
    foreach ($p in $profiles) {
        $login = Join-Path $p.FullName 'Login Data'
        if (-not (Test-Path -LiteralPath $login)) { continue }
        $tmp = $null
        try {
            $tmp = Copy-Locked $login
            $rows = [Awlad.Sql]::Query($tmp, 'SELECT origin_url, password_value FROM logins')
            foreach ($row in $rows) {
                $result.Found++
                $url = [string]$row[0]
                if ($url) { [void]$result.Domains.Add((Get-HostOnly $url)) }
                if ($key -ne $null) {
                    try {
                        $len = Get-DecryptedLength -Key $key -Blob $row[1]
                        if ($len -ge 0) { $result.Decrypted++ }
                    } catch {}
                }
            }
        } catch {
            $result.Detail = ($result.Detail + " [profil $($p.Name): $($_.Exception.Message)]").Trim()
        }
    }
    return $result
}

function Probe-E {
    Add-Line ""
    Add-Line "[Sonde E] Mots de passe enregistres des navigateurs (Chrome/Edge/Firefox)..."
    if (-not $script:NativeOK) { return (New-Verdict 'E - Mots de passe navigateurs' 'ERROR' "Code natif non compile: $script:NativeErr") }
    try {
        $parts = @()
        $anyDecrypted = $false
        $anyFound = $false

        $targets = @(
            @{ Name = 'Chrome'; Dir = (Join-Path $env:LOCALAPPDATA 'Google\Chrome\User Data') },
            @{ Name = 'Edge';   Dir = (Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\User Data') }
        )
        foreach ($t in $targets) {
            $r = Probe-E-Chromium -BrowserName $t.Name -UserDataDir $t.Dir
            if ($r.Found -gt 0) { $anyFound = $true }
            if ($r.Decrypted -gt 0) { $anyDecrypted = $true }
            $doms = if ($r.Domains.Count -gt 0) { ($r.Domains -join ', ') } else { '-' }
            $line = "$($t.Name): trouves=$($r.Found), dechiffres=$($r.Decrypted), domaines=[$doms]"
            if ($r.Detail) { $line += " ($($r.Detail))" }
            $parts += $line
        }

        # Firefox : DETECTE mais NON DECODE (NSS non implemente)
        $ffProfiles = Join-Path $env:APPDATA 'Mozilla\Firefox\Profiles'
        if (Test-Path -LiteralPath $ffProfiles) {
            $ffFound = $false
            try {
                Get-ChildItem -LiteralPath $ffProfiles -Directory -ErrorAction Stop | ForEach-Object {
                    if ((Test-Path -LiteralPath (Join-Path $_.FullName 'logins.json')) -and
                        (Test-Path -LiteralPath (Join-Path $_.FullName 'key4.db'))) { $ffFound = $true }
                }
            } catch {}
            if ($ffFound) { $parts += "Firefox: logins.json + key4.db presents => DETECTE-NON-DECODE (NSS non implemente dans ce prototype)" }
            else { $parts += "Firefox: profils presents mais pas de logins.json/key4.db" }
        } else {
            $parts += "Firefox: non installe"
        }

        $notes = $parts -join ' | '
        $verdict = if ($anyDecrypted) { 'PASS' } elseif ($anyFound) { 'PARTIAL' } else { 'FAIL' }
        return (New-Verdict 'E - Mots de passe navigateurs' $verdict $notes)
    } catch {
        return (New-Verdict 'E - Mots de passe navigateurs' 'ERROR' $_.Exception.Message)
    }
}

# -----------------------------------------------------------------------------
# PROBE F — Historique de navigation (7 derniers jours, domaines seulement)
# -----------------------------------------------------------------------------
function Probe-F-Chromium {
    param([string]$UserDataDir)
    $res = [pscustomobject]@{ Count = 0; Domains = (New-Object System.Collections.Generic.HashSet[string]); Detail = '' }
    if (-not (Test-Path -LiteralPath $UserDataDir)) { $res.Detail = 'non installe'; return $res }
    # Chrome stocke le temps en microsecondes depuis 1601-01-01.
    $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $threshUnix = $now - (7 * 24 * 3600)
    $threshChrome = ($threshUnix + 11644473600) * 1000000
    $profiles = @()
    try {
        $profiles = Get-ChildItem -LiteralPath $UserDataDir -Directory -ErrorAction Stop |
            Where-Object { $_.Name -eq 'Default' -or $_.Name -like 'Profile*' }
    } catch {}
    foreach ($p in $profiles) {
        $hist = Join-Path $p.FullName 'History'
        if (-not (Test-Path -LiteralPath $hist)) { continue }
        try {
            $tmp = Copy-Locked $hist
            $sql = "SELECT url FROM urls WHERE last_visit_time >= $threshChrome"
            $rows = [Awlad.Sql]::Query($tmp, $sql)
            foreach ($row in $rows) {
                $res.Count++
                $u = [string]$row[0]
                if ($u) { [void]$res.Domains.Add((Get-HostOnly $u)) }
            }
        } catch {
            $res.Detail = ($res.Detail + " [profil $($p.Name): $($_.Exception.Message)]").Trim()
        }
    }
    return $res
}

function Probe-F-Firefox {
    $res = [pscustomobject]@{ Count = 0; Domains = (New-Object System.Collections.Generic.HashSet[string]); Detail = '' }
    $ffProfiles = Join-Path $env:APPDATA 'Mozilla\Firefox\Profiles'
    if (-not (Test-Path -LiteralPath $ffProfiles)) { $res.Detail = 'non installe'; return $res }
    # Firefox : last_visit_date en microsecondes depuis l'epoque Unix (PRTime)
    $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $threshMoz = ($now - (7 * 24 * 3600)) * 1000000
    try {
        $profiles = Get-ChildItem -LiteralPath $ffProfiles -Directory -ErrorAction Stop
    } catch { $profiles = @() }
    foreach ($p in $profiles) {
        $places = Join-Path $p.FullName 'places.sqlite'
        if (-not (Test-Path -LiteralPath $places)) { continue }
        try {
            $tmp = Copy-Locked $places
            $sql = "SELECT url FROM moz_places WHERE last_visit_date >= $threshMoz"
            $rows = [Awlad.Sql]::Query($tmp, $sql)
            foreach ($row in $rows) {
                $res.Count++
                $u = [string]$row[0]
                if ($u) { [void]$res.Domains.Add((Get-HostOnly $u)) }
            }
        } catch {
            $res.Detail = ($res.Detail + " [profil $($p.Name): $($_.Exception.Message)]").Trim()
        }
    }
    return $res
}

function Probe-F {
    Add-Line ""
    Add-Line "[Sonde F] Historique de navigation (7 derniers jours, domaines seulement)..."
    if (-not $script:NativeOK) { return (New-Verdict 'F - Historique navigation' 'ERROR' "Code natif non compile: $script:NativeErr") }
    try {
        $parts = @()
        $total = 0
        $targets = @(
            @{ Name = 'Chrome'; Dir = (Join-Path $env:LOCALAPPDATA 'Google\Chrome\User Data') },
            @{ Name = 'Edge';   Dir = (Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\User Data') }
        )
        foreach ($t in $targets) {
            $r = Probe-F-Chromium -UserDataDir $t.Dir
            $total += $r.Count
            $sample = @($r.Domains) | Select-Object -First 8
            $doms = if ($sample.Count -gt 0) { ($sample -join ', ') } else { '-' }
            $line = "$($t.Name): entrees(7j)=$($r.Count), ex. domaines=[$doms]"
            if ($r.Detail) { $line += " ($($r.Detail))" }
            $parts += $line
        }
        $rf = Probe-F-Firefox
        $total += $rf.Count
        $sampleF = @($rf.Domains) | Select-Object -First 8
        $domsF = if ($sampleF.Count -gt 0) { ($sampleF -join ', ') } else { '-' }
        $lineF = "Firefox: entrees(7j)=$($rf.Count), ex. domaines=[$domsF]"
        if ($rf.Detail) { $lineF += " ($($rf.Detail))" }
        $parts += $lineF

        $notes = $parts -join ' | '
        $verdict = if ($total -ge 1) { 'PASS' } else { 'FAIL' }
        return (New-Verdict 'F - Historique navigation' $verdict $notes)
    } catch {
        return (New-Verdict 'F - Historique navigation' 'ERROR' $_.Exception.Message)
    }
}

# =============================================================================
# ORCHESTRATION
# =============================================================================
Clear-Host 2>$null
Add-Line "==============================================================================="
Add-Line " AwladShield - ETAPE 0 - Sonde de faisabilite (prototype DIAGNOSTIQUE jetable)"
Add-Line "==============================================================================="
Add-Line " A n'executer QUE sur VOS ordinateurs (controle parental informe/autorise)."
Add-Line " Ce script n'envoie RIEN sur le reseau. Le rapport ne contient AUCUN secret."
Add-Line "==============================================================================="
Add-Line ""

# ---- Contexte systeme (le coeur du sujet : que peut un utilisateur STANDARD ?)
$whoami = $env:USERNAME
try {
    $idn = [System.Security.Principal.WindowsIdentity]::GetCurrent()
    $prin = New-Object System.Security.Principal.WindowsPrincipal($idn)
    $isAdmin = $prin.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
} catch { $isAdmin = $null }

$osCaption = ''
try { $osCaption = (Get-CimInstance Win32_OperatingSystem -ErrorAction Stop).Caption } catch {}
$osVer = [System.Environment]::OSVersion.Version.ToString()
$psVer = $PSVersionTable.PSVersion.ToString()
$psEdition = $PSVersionTable.PSEdition

Add-Line "Contexte :"
Add-Line "  Utilisateur        : $whoami"
Add-Line "  Elevation (admin)  : $isAdmin   (l'objectif est de tester un compte STANDARD)"
Add-Line "  Windows            : $osCaption ($osVer)"
Add-Line "  PowerShell         : $psVer / $psEdition"
Add-Line "  Code natif compile : $script:NativeOK$(if(-not $script:NativeOK){"  ERREUR: $script:NativeErr"})"
Add-Line ""
Add-Line "Lancement des sondes. Suivez les invites a l'ecran (sondes C et D demandent"
Add-Line "d'interagir : tapez du texte et cliquez dans des champs, dont un mot de passe)."
Add-Line "-------------------------------------------------------------------------------"
Add-Line ""

$results = @()
$results += Probe-A
$results += Probe-B
$results += Probe-C
$results += Probe-D
$results += Probe-E
$results += Probe-F

# ---- Nettoyage des fichiers temporaires copies
foreach ($f in $script:TempFiles) {
    try { if (Test-Path -LiteralPath $f) { Remove-Item -LiteralPath $f -Force -ErrorAction SilentlyContinue } } catch {}
}

# ---- Tableau de synthese
Add-Line ""
Add-Line "==============================================================================="
Add-Line " SYNTHESE DES VERDICTS"
Add-Line "==============================================================================="
$table = ($results | Format-Table -AutoSize -Property Name, Verdict, Notes -Wrap | Out-String)
foreach ($l in ($table -split "`r?`n")) { if ($l.Trim().Length -gt 0) { Add-Line $l } }

$countPass    = ($results | Where-Object { $_.Verdict -eq 'PASS' }).Count
$countPartial = ($results | Where-Object { $_.Verdict -eq 'PARTIAL' }).Count
$countFail    = ($results | Where-Object { $_.Verdict -eq 'FAIL' }).Count
$countErr     = ($results | Where-Object { $_.Verdict -eq 'ERROR' }).Count
Add-Line ""
Add-Line "Bilan : PASS=$countPass  PARTIAL=$countPartial  FAIL=$countFail  ERROR=$countErr"
Add-Line ""

# ---- Conclusion en clair
Add-Line "==============================================================================="
Add-Line " CONCLUSION"
Add-Line "==============================================================================="
Add-Line "Cette etape 0 avait pour SEUL but de mesurer ce qu'un compte utilisateur standard"
Add-Line "peut reellement capturer, afin de decider quoi construire ensuite. Le rapport"
Add-Line "ci-dessus a ete enregistre dans un fichier texte SANS AUCUN SECRET (ni mot de"
Add-Line "passe, ni texte saisi, ni URL complete : uniquement des compteurs, des verdicts"
Add-Line "et des domaines). Merci de RENVOYER ce fichier au developpeur :"
Add-Line "    $script:ReportPath"
Add-Line "Vous pouvez l'ouvrir et le relire avant de l'envoyer ; il est concu pour etre sur."
Add-Line "==============================================================================="

# ---- Ecriture du rapport sur disque (horodatage en tete)
$header = @(
    "AwladShield - Rapport de sonde ETAPE 0",
    "Genere le : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')",
    "Machine   : $env:COMPUTERNAME / utilisateur $whoami / admin=$isAdmin",
    "Windows   : $osCaption ($osVer) - PowerShell $psVer/$psEdition",
    "AUCUN SECRET DANS CE FICHIER (compteurs, verdicts, domaines, longueurs masquees).",
    "==============================================================================="
)
try {
    $all = $header + @('') + ($script:Lines.ToArray())
    Set-Content -LiteralPath $script:ReportPath -Value $all -Encoding UTF8
    Write-Host ""
    Write-Host "Rapport ecrit : $script:ReportPath"
} catch {
    Write-Host "ERREUR d'ecriture du rapport : $($_.Exception.Message)"
}
