package in.mahadevtraders.desk;

/** Home-screen widget: one big tile that opens the Cashier desk (taking the money, releasing the oil). */
public class CashierWidget extends BaseWidget {
    @Override
    protected String kind() {
        return "cashier";
    }
}
