package stack_queue;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.ArrayDeque;
import java.util.Deque;

public class BOJ_10866 {

    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder sb = new StringBuilder();

        int N = Integer.parseInt(br.readLine().trim());
        Deque<Integer> dq = new ArrayDeque<>();

        while (N-- > 0) {
            String line = br.readLine();
            execute(line, dq, sb);
        }

        System.out.print(sb);
        br.close();
    }

    private static void execute(String line, Deque<Integer> dq, StringBuilder sb) {
        String[] parts = line.split(" ");
        String op = parts[0];

        switch (op) {
            case "push_front":
                dq.addFirst(Integer.parseInt(parts[1]));
                break;
            case "push_back":
                dq.addLast(Integer.parseInt(parts[1]));
                break;
            case "pop_front": {
                Integer v = dq.pollFirst();
                sb.append(v == null ? -1 : v).append('\n');
                break;
            }
            case "pop_back": {
                Integer v = dq.pollLast();
                sb.append(v == null ? -1 : v).append('\n');
                break;
            }
            case "size":
                sb.append(dq.size()).append('\n');
                break;
            case "empty":
                sb.append(dq.isEmpty() ? 1 : 0).append('\n');
                break;
            case "front": {
                Integer v = dq.peekFirst();
                sb.append(v == null ? -1 : v).append('\n');
                break;
            }
            case "back": {
                Integer v = dq.peekLast();
                sb.append(v == null ? -1 : v).append('\n');
                break;
            }
        }
    }
}
