using System;
using System.Windows.Forms;

public class Typer {
    [STAThread]
    public static void Main() {
        string line;
        while ((line = Console.ReadLine()) != null) {
            if (line == "__EXIT__") break;
            try {
                SendKeys.SendWait(line);
            } catch (Exception) {
                // Ignore errors
            }
        }
    }
}
