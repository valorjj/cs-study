package hash;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.HashMap;
import java.util.HashSet;
import java.util.StringTokenizer;

public class BOJ_1620 {

    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        StringTokenizer st = new StringTokenizer(br.readLine());
        // pokemon count
        int N = Integer.parseInt(st.nextToken());
        // question count
        int M = Integer.parseInt(st.nextToken());

        HashMap<Integer, String> indexToName = new HashMap<>();
        HashMap<String, Integer> nameToIndex = new HashMap<>();

        int idx = 0;
        while (N-- > 0) {
            indexToName.put(idx, br.readLine());
            nameToIndex.put(br.readLine(), idx);

            idx++;
        }

        StringBuilder sb = new StringBuilder();

        while (M-- > 0) {
            st = new StringTokenizer(br.readLine());
            boolean isIndex = indexToName.containsKey(Integer.parseInt(st.nextToken()));

            if (isIndex) {
                sb.append(indexToName.get(Integer.parseInt(st.nextToken()))).append('\n');
            } else {
                sb.append(nameToIndex.get(st.nextToken())).append('\n');
            }
        }

        System.out.println(sb);
        br.close();
    }
}
