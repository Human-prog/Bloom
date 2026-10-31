Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class WinRect {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr lParam);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr hWnd, int index);
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
"@

$pids = @(Get-Process electron,'Bloom Notch' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
Write-Output ("electron pids: " + ($pids -join ", "))

$results = New-Object System.Collections.ArrayList
$cb = [WinRect+EnumProc]{
  param($hWnd, $lParam)
  $procId = 0
  [void][WinRect]::GetWindowThreadProcessId($hWnd, [ref]$procId)
  if ($pids -contains [int]$procId) {
    $r = New-Object WinRect+RECT
    [void][WinRect]::GetWindowRect($hWnd, [ref]$r)
    $w = $r.Right - $r.Left
    $h = $r.Bottom - $r.Top
    if ($w -gt 0 -and $h -gt 0) {
      $sb = New-Object System.Text.StringBuilder 256
      [void][WinRect]::GetWindowText($hWnd, $sb, 256)
      $exStyle = [WinRect]::GetWindowLong($hWnd, -20)
      [void]$results.Add([pscustomobject]@{
        pid = [int]$procId
        hwnd = $hWnd.ToInt64()
        visible = [WinRect]::IsWindowVisible($hWnd)
        rect = "$($r.Left),$($r.Top) $($w)x$($h)"
        title = $sb.ToString()
        topmost = (($exStyle -band 0x8) -ne 0)
        transparent = (($exStyle -band 0x20) -ne 0)
      })
    }
  }
  return $true
}
[void][WinRect]::EnumWindows($cb, [IntPtr]::Zero)
$results | Format-Table -AutoSize

Add-Type -AssemblyName System.Windows.Forms
$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
Write-Output ("primary screen: " + $screen.Width + "x" + $screen.Height + " at " + $screen.X + "," + $screen.Y)
