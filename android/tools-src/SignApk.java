import com.android.apksig.ApkSigner;
import com.android.apksig.ApkVerifier;
import java.io.File;
import java.io.FileInputStream;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.cert.X509Certificate;
import java.util.Collections;

// Firma un APK con el esquema v2 (suficiente desde Android 7, minSdk 24) usando apksig y lo verifica.
// Uso: SignApk <entrada.apk> <salida.apk> <keystore.p12> <alias> <contraseña>
public class SignApk {
    public static void main(String[] a) throws Exception {
        char[] pass = a[4].toCharArray();
        KeyStore ks = KeyStore.getInstance("PKCS12");
        try (FileInputStream in = new FileInputStream(a[2])) {
            ks.load(in, pass);
        }
        PrivateKey key = (PrivateKey) ks.getKey(a[3], pass);
        X509Certificate cert = (X509Certificate) ks.getCertificate(a[3]);
        ApkSigner.SignerConfig sc = new ApkSigner.SignerConfig.Builder("BRUNOS", key, Collections.singletonList(cert)).build();
        new ApkSigner.Builder(Collections.singletonList(sc))
                .setInputApk(new File(a[0]))
                .setOutputApk(new File(a[1]))
                .setMinSdkVersion(24)
                .setV1SigningEnabled(false)
                .setV2SigningEnabled(true)
                .build()
                .sign();
        ApkVerifier.Result r = new ApkVerifier.Builder(new File(a[1])).build().verify();
        System.out.println("verificado=" + r.isVerified() + " v1=" + r.isVerifiedUsingV1Scheme() + " v2=" + r.isVerifiedUsingV2Scheme());
        for (ApkVerifier.IssueWithParams e : r.getErrors()) System.out.println("ERROR " + e);
        if (!r.isVerified()) System.exit(1);
    }
}
