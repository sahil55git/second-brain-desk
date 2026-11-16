package in.mahadevtraders.desk;

/** Home-screen keypad: type an amount, tap a kind, the entry form opens filled in. */
public class KeypadWidget extends BaseWidget {
    @Override
    protected String kind() {
        return "keypad";
    }

    @Override
    public void onReceive(android.content.Context c, android.content.Intent intent) {
        if (Widgets.ACTION_KEY.equals(intent.getAction())) {
            Widgets.key(c, intent.getStringExtra(Widgets.EXTRA_KEY));
            return;
        }
        super.onReceive(c, intent);
    }
}
